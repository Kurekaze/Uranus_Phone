/**
 * 冒充 `node:fs` 的虚拟文件系统，底下是 Durable Object 的同步 KV（ctx.storage.kv）。
 *
 * 为什么这么做：server 里读写 data/ 的模块（配置、会话、记忆、表情包……）全是
 * 同步的 fs 调用。SQLite 版的 DO 恰好有一套**同步**的 KV 接口，把它包成 fs 的
 * 样子，这些模块就能原样跑，不用逐个改成 async。
 *
 * 只实现 server 里实际用到的那十几个函数。键：
 *   f:<绝对路径>   文件内容（string 或 Uint8Array）
 *   d:<绝对路径>   目录标记（值是 1）
 *
 * DO 构造时调 setBackend(ctx.storage.kv)。一个 Worker 只有一个 DO 实例，
 * 所以放模块级全局就够了。
 */

let kv = null;

export function setBackend(storageKv) {
  kv = storageKv;
}

function need() {
  if (!kv) throw new Error("虚拟文件系统还没接上存储（setBackend 没调）");
  return kv;
}

function norm(p) {
  let s = String(p instanceof URL ? p.pathname : p).replace(/\\/g, "/");
  if (!s.startsWith("/")) s = "/" + s;
  const out = [];
  for (const seg of s.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") out.pop();
    else out.push(seg);
  }
  return "/" + out.join("/");
}

const parentOf = (p) => p.slice(0, p.lastIndexOf("/")) || "/";

function enoent(op, p) {
  const e = new Error(`ENOENT: no such file or directory, ${op} '${p}'`);
  e.code = "ENOENT";
  e.errno = -2;
  e.syscall = op;
  e.path = p;
  return e;
}

function isDir(p) {
  if (p === "/") return true;
  if (need().get("d:" + p) !== undefined) return true;
  // 没有显式标记，但底下有文件，也算目录
  for (const _ of need().list({ prefix: "f:" + p + "/", limit: 1 })) return true;
  return false;
}

function isFile(p) {
  return need().get("f:" + p) !== undefined;
}

function markDirs(p) {
  let cur = p;
  while (cur !== "/" && need().get("d:" + cur) === undefined) {
    need().put("d:" + cur, 1);
    cur = parentOf(cur);
  }
}

function decode(v, enc) {
  if (enc) return typeof v === "string" ? v : new TextDecoder().decode(v);
  const bytes = typeof v === "string" ? new TextEncoder().encode(v) : v;
  return globalThis.Buffer ? globalThis.Buffer.from(bytes) : bytes;
}

const encOf = (opts) => (typeof opts === "string" ? opts : opts?.encoding) || null;

function toStored(data) {
  if (typeof data === "string") return data;
  if (data instanceof Uint8Array) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice();
  return String(data);
}

export function existsSync(p) {
  const n = norm(p);
  return isFile(n) || isDir(n);
}

export function readFileSync(p, opts) {
  const n = norm(p);
  const v = need().get("f:" + n);
  if (v === undefined) throw enoent("open", n);
  return decode(v, encOf(opts));
}

export function writeFileSync(p, data) {
  const n = norm(p);
  markDirs(parentOf(n));
  need().put("f:" + n, toStored(data));
}

export function appendFileSync(p, data) {
  const n = norm(p);
  const old = need().get("f:" + n);
  const prev = old === undefined ? "" : typeof old === "string" ? old : new TextDecoder().decode(old);
  writeFileSync(n, prev + (typeof data === "string" ? data : new TextDecoder().decode(data)));
}

export function mkdirSync(p) {
  markDirs(norm(p));
}

export function readdirSync(p, opts) {
  const n = norm(p);
  if (!isDir(n)) throw enoent("scandir", n);
  const base = n === "/" ? "/" : n + "/";
  const names = new Map();
  for (const kind of ["f:", "d:"]) {
    for (const [key] of need().list({ prefix: kind + base })) {
      const rest = key.slice(kind.length + base.length);
      const name = rest.split("/")[0];
      if (!name) continue;
      const dir = kind === "d:" || rest.includes("/");
      names.set(name, names.get(name) || dir);
    }
  }
  const list = [...names.keys()].sort();
  if (!opts?.withFileTypes) return list;
  return list.map((name) => {
    const dir = names.get(name);
    return { name, isFile: () => !dir, isDirectory: () => dir, isSymbolicLink: () => false };
  });
}

export function statSync(p, opts) {
  const n = norm(p);
  const file = need().get("f:" + n);
  if (file === undefined && !isDir(n)) {
    if (opts?.throwIfNoEntry === false) return undefined;
    throw enoent("stat", n);
  }
  const size = file === undefined ? 0 : typeof file === "string" ? new TextEncoder().encode(file).length : file.length;
  const now = new Date();
  return {
    size,
    isFile: () => file !== undefined,
    isDirectory: () => file === undefined,
    isSymbolicLink: () => false,
    mtime: now, mtimeMs: now.getTime(), ctime: now, birthtime: now,
  };
}

export const lstatSync = statSync;

export function unlinkSync(p) {
  const n = norm(p);
  if (!isFile(n)) throw enoent("unlink", n);
  need().delete("f:" + n);
}

export function renameSync(from, to) {
  const a = norm(from), b = norm(to);
  if (isFile(a)) {
    writeFileSync(b, need().get("f:" + a));
    need().delete("f:" + a);
    return;
  }
  if (!isDir(a)) throw enoent("rename", a);
  for (const kind of ["f:", "d:"]) {
    for (const [key, v] of [...need().list({ prefix: kind + a + "/" })]) {
      need().put(kind + b + key.slice(kind.length + a.length), v);
      need().delete(key);
    }
  }
  need().delete("d:" + a);
  markDirs(b);
}

export function copyFileSync(from, to) {
  const a = norm(from);
  const v = need().get("f:" + a);
  if (v === undefined) throw enoent("copyfile", a);
  writeFileSync(to, v);
}

export function rmSync(p, opts) {
  const n = norm(p);
  if (isFile(n)) return need().delete("f:" + n);
  if (!isDir(n)) {
    if (opts?.force) return;
    throw enoent("rm", n);
  }
  for (const kind of ["f:", "d:"]) {
    for (const [key] of [...need().list({ prefix: kind + n + "/" })]) need().delete(key);
  }
  need().delete("d:" + n);
}

export function rmdirSync(p) {
  rmSync(p, { recursive: true, force: true });
}

// 原子写盘那套（open → write → fsync → close → rename）在 KV 上没意义，给空实现兜住
export function openSync() { return 3; }
export function closeSync() {}
export function fsyncSync() {}
export function writeSync() {}

export function createReadStream() {
  throw new Error("Worker 里没有文件流（createReadStream）");
}
export function createWriteStream() {
  throw new Error("Worker 里没有文件流（createWriteStream）");
}
export function watch() {
  return { close() {} };
}

export const constants = { F_OK: 0, R_OK: 4, W_OK: 2, X_OK: 1 };

const wrap = (fn) => async (...args) => fn(...args);
export const promises = {
  readFile: wrap(readFileSync),
  writeFile: wrap(writeFileSync),
  appendFile: wrap(appendFileSync),
  mkdir: wrap(mkdirSync),
  readdir: wrap(readdirSync),
  stat: wrap(statSync),
  lstat: wrap(statSync),
  unlink: wrap(unlinkSync),
  rename: wrap(renameSync),
  copyFile: wrap(copyFileSync),
  rm: wrap(rmSync),
  rmdir: wrap(rmdirSync),
  access: wrap((p) => { if (!existsSync(p)) throw enoent("access", norm(p)); }),
};

export default {
  existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync, readdirSync,
  statSync, lstatSync, unlinkSync, renameSync, copyFileSync, rmSync, rmdirSync,
  openSync, closeSync, fsyncSync, writeSync, createReadStream, createWriteStream,
  watch, constants, promises,
};
