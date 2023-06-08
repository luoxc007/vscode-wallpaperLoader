import * as fs from "fs";
import path = require("path");

export function getDirPath(filePath: string) {
  const sep = path.sep;
  if (filePath[filePath.length - 1] === sep) {
    filePath = filePath.slice(0, -1);
  }
  const parentDir = filePath.split(sep).slice(0, -1).join(sep);
  return parentDir || filePath;
}

export function getFilename(inputPath: string, sep: string = path.sep) {
  if (inputPath[inputPath.length - 1] === sep) {
    inputPath = inputPath.slice(0, -1);
  }
  const parts = inputPath.split(sep);
  return parts[parts.length - 1];
}

class RuntimeError implements Error {
  constructor(
    public name: string,
    public message: string,
    stack?: string | undefined
  ) {}
}

export function ensure(res: any) {
  if (!res) throw new RuntimeError("Runtime error", "Extension stop");
}

export async function fileExisted(filename: string) {
  return new Promise<boolean>((f1, f2) => {
    fs.access(filename, (err) => {
      f1(err ? false : true);
    });
  });
}

export async function fileCopy(srcFilePath: string, tarFilePath: string) {
  return new Promise((f1, f2) => {
    fs.cp(srcFilePath, tarFilePath, (err) => {
      if (err) {
        f2(err);
        return;
      } else {
        f1(true);
      }
    });
  });
}

export async function fileRename(srcFilePath: string, tarFilePath: string) {
  return new Promise((f1, f2) => {
    fs.rename(srcFilePath, tarFilePath, (err) => {
      if (err) {
        f2(err);
        return;
      } else {
        f1(true);
      }
    });
  });
}

export async function dirRead(dirPath: string) {
  return new Promise<string[]>((f1, f2) => {
    fs.readdir(dirPath, (err, files) => {
      if (err) {
        f2(err);
        return;
      } else {
        f1(files);
      }
    });
  });
}
export async function fileRemove(filename: string) {
  return new Promise((f1, f2) => {
    fs.rm(filename, (err) => {
      if (err) f2(err);
      else f1(true);
    });
  });
}

// 强行初始化文件
export async function initFile(filepath: string) {
  const existed = await new Promise((resolve, reject) => {
    fs.access(filepath, (err) => {
      resolve(err ? false : true);
    });
  });
  if (!existed) {
    return await new Promise<boolean>((f1, f2) => {
      fs.writeFile(filepath, "", (err) => {
        if (err) {
          f2(err);
        } else {
          f1(true);
        }
      });
    });
  } else {
    return true;
  }
}

export async function initDir(dirpath: string) {
  const existed = await new Promise((resolve, reject) => {
    fs.access(dirpath, (err) => {
      resolve(err ? false : true);
    });
  });
  if (!existed) {
    return await new Promise<boolean>((f1, f2) => {
      fs.mkdir(dirpath, { recursive: true }, (err) => {
        if (err) {
          f2(err);
        } else {
          f1(true);
        }
      });
    });
  } else {
    return true;
  }
}


export function replaceAll(
  input: string,
  searchValue: string,
  replaceValue: string
): string {
  return input.replace(new RegExp(searchValue, "g"), replaceValue);
}

export function getNonce() {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

export function getDisplayFilename(filename: string) {
  const maxLength = 24;

  if (filename.length < maxLength) {
    return filename;
  }
  const ptr = filename.lastIndexOf(".");
  const rawfilename = filename.substring(0, ptr);
  const postFix = filename.substring(ptr);
  const postFixLength = filename.length - ptr;

  const res = `${rawfilename.substring(0, maxLength - postFixLength)}~~~${postFix}`;
  return res;
}


export function shuffleArray<T>(array: T[]): T[] {
  const newArray = [...array]; // 创建一个新数组来保持原数组不变

  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]]; // 交换元素位置
  }

  return newArray;
}