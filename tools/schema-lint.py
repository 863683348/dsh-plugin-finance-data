#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
js_schema_lint.py — DSH 插件 tool schema 合规检查 / 修复

检测两类违规（源自 @deepseek-ai/dsh-tools 的 value schema DSL 约束）：

  E001  type:"object" 节点未显式声明布尔 additionalProperties
        报错原文: parameters.<name>.additionalProperties must be explicitly true or false
  E001B additionalProperties 写了但不是布尔字面量
  E002  output schema 根节点携带 required
        报错原文: schema.required is not supported by the value schema DSL

实现：字符串/注释屏蔽 + 括号配对 + 迷你对象字面量解析器 + 语句块/对象字面量判别。
不依赖任何外部包；改动使用「字符偏移文本手术」，完整保留原格式。

取值规范（跟随仓库既有约定）：
  output schema          -> additionalProperties: true   （宽松，避免把真实输出判非法）
  parameters 有 properties -> additionalProperties: false （封闭）
  parameters 无 properties -> additionalProperties: true  （自由透传）

用法：
  python js_schema_lint.py <file.js> [--json]
  python js_schema_lint.py <file.js> --fix [--dry-run] [--ap-value true|false]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


# --------------------------------------------------------------------------
# 屏蔽：注释与字符串内容替换为等长空白，保证括号配对不被内容干扰
# --------------------------------------------------------------------------
def mask_source(src: str) -> str:
    out = list(src)
    n = len(src)
    i = 0

    def blank(a: int, b: int) -> None:
        for k in range(a, min(b, n)):
            if out[k] != "\n":
                out[k] = " "

    while i < n:
        c = src[i]
        nxt = src[i + 1] if i + 1 < n else ""
        if c == "/" and nxt == "/":
            j = src.find("\n", i)
            j = n if j < 0 else j
            blank(i, j)
            i = j
        elif c == "/" and nxt == "*":
            j = src.find("*/", i + 2)
            j = n if j < 0 else j + 2
            blank(i, j)
            i = j
        elif c in "\"'`":
            j = _str_end(src, i)
            blank(i + 1, j - 1)
            i = j
        else:
            i += 1
    return "".join(out)


def _str_end(src: str, i: int) -> int:
    """src[i] 是引号，返回闭合引号之后的下标。"""
    q = src[i]
    j = i + 1
    n = len(src)
    while j < n:
        if src[j] == "\\":
            j += 2
            continue
        if src[j] == q:
            return j + 1
        j += 1
    return n


def read_string(src: str, i: int) -> str:
    e = _str_end(src, i)
    return src[i + 1 : e - 1]


def skip_ws(msk: str, i: int) -> int:
    n = len(msk)
    while i < n and msk[i] in " \t\r\n":
        i += 1
    return i


def match_bracket(msk: str, i: int, open_c: str, close_c: str) -> int:
    depth = 0
    n = len(msk)
    while i < n:
        c = msk[i]
        if c == open_c:
            depth += 1
        elif c == close_c:
            depth -= 1
            if depth == 0:
                return i
        i += 1
    return -1


# --------------------------------------------------------------------------
# 迷你对象字面量解析：提取直接子键的键区间与值区间
# --------------------------------------------------------------------------
def parse_object(src: str, msk: str, start: int):
    """start 指向 '{'。返回 (items, obj_end_exclusive)。

    items: list[(key, k_start, k_end, v_start, v_end, kind)]
           kind ∈ {object, array, other, shorthand}；shorthand 时 v_* 为 None
    """
    end = match_bracket(msk, start, "{", "}")
    if end < 0:
        return [], len(msk)

    items = []
    i = start + 1
    while True:
        i = skip_ws(msk, i)
        if i >= end:
            break
        if msk[i] == ",":
            i += 1
            continue
        if msk[i] == "}":
            break

        if msk.startswith("...", i):
            i += 3
            _, i, _ = read_value(src, msk, skip_ws(msk, i))
            continue

        k_start = i
        key = None
        if msk[i] in "\"'`":
            key = read_string(src, i)
            i = _str_end(src, i)
        else:
            j = i
            while j < end and (msk[j].isalnum() or msk[j] in "_$"):
                j += 1
            if j > i:
                key = src[i:j]
                i = j
            else:
                i += 1
                continue
        k_end = i

        i = skip_ws(msk, i)
        if i < end and msk[i] == "[":
            ci = match_bracket(msk, i, "[", "]")
            i = ci + 1 if ci > 0 else i + 1
            i = skip_ws(msk, i)
            key = "[computed]"

        if i < end and msk[i] == ":":
            i = skip_ws(msk, i + 1)
            vs, ve, kind = read_value(src, msk, i)
            items.append((key, k_start, k_end, vs, ve, kind))
            i = ve
        else:
            items.append((key, k_start, k_end, None, None, "shorthand"))

    return items, end + 1


def read_value(src: str, msk: str, i: int):
    """返回 (v_start, v_end, kind)。"""
    n = len(msk)
    if i >= n:
        return i, i, "other"
    c = msk[i]
    if c == "{":
        e = match_bracket(msk, i, "{", "}")
        return i, (e + 1 if e > 0 else n), "object"
    if c == "[":
        e = match_bracket(msk, i, "[", "]")
        return i, (e + 1 if e > 0 else n), "array"
    if c == "(":
        e = match_bracket(msk, i, "(", ")")
        return i, (e + 1 if e > 0 else n), "other"
    if c == "`":
        return i, _str_end(src, i), "other"

    j = i
    depth = 0
    while j < n:
        ch = msk[j]
        if ch in "([{":
            depth += 1
        elif ch in ")]}":
            if depth == 0:
                break
            depth -= 1
        elif ch == "," and depth == 0:
            break
        j += 1
    e = j
    while e > i and src[e - 1] in " \t\r\n":
        e -= 1
    return i, e, "other"


def line_of(src: str, off: int) -> int:
    return src.count("\n", 0, off) + 1


# --------------------------------------------------------------------------
# 分析与修复
# --------------------------------------------------------------------------
class Lint:
    _EXPR_WORDS = {
        "return", "case", "in", "of", "typeof", "delete",
        "void", "new", "yield", "await", "throw",
    }

    def __init__(self, src: str, ap_value: str | None = None):
        self.src = src
        self.msk = mask_source(src)
        self.ap_value = ap_value  # None = 按上下文自动取值
        self.found: list[dict] = []
        self.edits: list[tuple[int, int, str]] = []

    @staticmethod
    def pick_ap_value(mode: str, has_properties: bool) -> str:
        if mode == "output":
            return "true"
        if mode == "params":
            return "false" if has_properties else "true"
        return "true"

    # ---- 语句块 vs 对象字面量 ----
    def _prev_sig(self, i: int) -> int:
        j = i - 1
        while j >= 0 and self.msk[j] in " \t\r\n":
            j -= 1
        return j

    def _word_before(self, i: int) -> str:
        j = self._prev_sig(i)
        if j < 0 or not (self.msk[j].isalnum() or self.msk[j] in "_$"):
            return ""
        k = j
        while k >= 0 and (self.msk[k].isalnum() or self.msk[k] in "_$"):
            k -= 1
        return self.msk[k + 1 : j + 1]

    def _is_object_literal(self, i: int) -> bool:
        """msk[i] == '{' 是对象字面量（True）还是语句块（False）。

        这是准确性的关键：`function f() {` 与 `defineTool({` 必须区分，
        否则会漏掉函数体里的 tool schema。
        """
        j = self._prev_sig(i)
        if j < 0:
            return False
        c = self.msk[j]
        if c in "=(,[":
            return True
        if c == ":":
            return True
        if c == ">":
            k = self._prev_sig(j)
            if k >= 0 and self.msk[k] == "=":
                return False  # => { 是箭头函数体
            return True
        if c in ")}];":
            return False
        if c.isalnum() or c in "_$":
            return self._word_before(i) in self._EXPR_WORDS
        return True

    # ---- 递归遍历 ----
    def walk(self, start: int, path: str, mode: str = "neutral", is_root: bool = False) -> None:
        items, obj_end = parse_object(self.src, self.msk, start)
        d: dict[str, tuple] = {}
        for it in items:
            d.setdefault(it[0], it)
        has_props = "properties" in d

        # --- E001 / E001B ---
        t = d.get("type")
        if t and t[3] is not None and self.src[t[3]] in "\"'`":
            if read_string(self.src, t[3]) == "object":
                val = self.ap_value or self.pick_ap_value(mode, has_props)
                ap = d.get("additionalProperties")
                if ap is None:
                    self.found.append(
                        {
                            "code": "E001",
                            "path": path,
                            "line": line_of(self.src, start),
                            "offset": start,
                            "message": "type:object 未显式声明 additionalProperties",
                            "fix": f"插入 additionalProperties: {val}",
                        }
                    )
                    self.edits.append(self._insertion(start, obj_end, t, val))
                else:
                    raw = self.src[ap[3] : ap[4]].strip() if ap[3] is not None else ""
                    if raw not in ("true", "false"):
                        self.found.append(
                            {
                                "code": "E001B",
                                "path": path,
                                "line": line_of(self.src, ap[1]),
                                "offset": ap[1],
                                "message": f"additionalProperties 不是布尔字面量（实为 {raw[:40]}）",
                                "fix": f"改写为 additionalProperties: {val}",
                            }
                        )
                        self.edits.append((ap[3], ap[4], val))

        # --- E002 ---
        if is_root and "required" in d:
            r = d["required"]
            self.found.append(
                {
                    "code": "E002",
                    "path": path,
                    "line": line_of(self.src, r[1]),
                    "offset": r[1],
                    "message": "output schema 根节点携带 required（DSL 不支持）",
                    "fix": "删除根级 required",
                }
            )
            self.edits.append(self._removal(r, obj_end))

        # --- 递归子节点 ---
        for k, it in d.items():
            vs, ve, kind = it[3], it[4], it[5]
            if vs is None:
                continue
            if kind == "object":
                child_mode = {"parameters": "params", "output": "output"}.get(k, mode)
                self.walk(
                    vs,
                    f"{path}.{k}",
                    mode=child_mode,
                    is_root=(k == "schema" and mode == "output"),
                )
            elif kind == "array":
                for obj_start in self.iter_objects_in(vs, ve):
                    self.walk(obj_start, f"{path}.{k}[]", mode=mode, is_root=False)

    # ---- 编辑计算 ----
    def _insertion(self, obj_start: int, obj_end: int, t: tuple, val: str):
        """把 additionalProperties 插到 type 行之后，保持同级缩进。"""
        single_line = "\n" not in self.src[obj_start:obj_end]
        if single_line:
            return (obj_start + 1, obj_start + 1, f" additionalProperties: {val},")

        t_ks, t_ke, t_vs, t_ve = t[1], t[2], t[3], t[4]
        line_start = self.src.rfind("\n", 0, t_ks) + 1
        ind = self.src[line_start:t_ks]
        j = t_ve
        while j < obj_end and self.src[j] in " \t":
            j += 1
        if j < obj_end and self.src[j] == ",":
            j += 1
        nl = self.src.find("\n", j)
        at = (nl + 1) if nl >= 0 else j
        return (at, at, f"{ind}additionalProperties: {val},\n")

    def _removal(self, prop: tuple, obj_end: int):
        """整行删除一个属性（含缩进与换行）；若该行还有别的内容则只删属性本身。"""
        k_start, k_end, v_start, v_end = prop[1], prop[2], prop[3], prop[4]
        ls = self.src.rfind("\n", 0, k_start) + 1
        prefix_only_ws = self.src[ls:k_start].strip() == ""

        j = v_end
        while j < obj_end and self.src[j] in " \t":
            j += 1
        if j < obj_end and self.src[j] == ",":
            j += 1

        if prefix_only_ws:
            eol = self.src.find("\n", j)
            eol = len(self.src) if eol < 0 else eol
            if self.src[j:eol].strip() == "":
                return (ls, min(eol + 1, len(self.src)), "")
        return (k_start, j, "")

    def iter_objects_in(self, start: int, end: int) -> list[int]:
        res = []
        i = start + 1
        while i < end:
            i = skip_ws(self.msk, i)
            if i >= end:
                break
            c = self.msk[i]
            if c == ",":
                i += 1
                continue
            if c == "{":
                e = match_bracket(self.msk, i, "{", "}")
                if e < 0:
                    break
                res.append(i)
                i = e + 1
            elif c == "`":
                i = _str_end(self.src, i)
            else:
                i += 1
        return res

    # ---- 执行 ----
    def run(self) -> None:
        i = 0
        n = len(self.msk)
        while i < n:
            c = self.msk[i]
            if c == "{":
                if self._is_object_literal(i):
                    self.walk(i, "$")
                    e = match_bracket(self.msk, i, "{", "}")
                    i = (e + 1) if e > 0 else i + 1
                else:
                    i += 1
            elif c == "`":
                i = _str_end(self.src, i)
            else:
                i += 1

        seen = set()
        uniq = []
        for v in self.found:
            key = (v["code"], v["offset"])
            if key in seen:
                continue
            seen.add(key)
            uniq.append(v)
        self.found = uniq

    def apply(self) -> str:
        """按偏移从后往前应用修改，避免位移错乱。"""
        out = self.src
        for a, b, text in sorted(self.edits, key=lambda e: -e[0]):
            out = out[:a] + text + out[b:]
        return out


def lint_text(src: str) -> Lint:
    lint = Lint(src)
    lint.run()
    return lint


def main() -> int:
    ap = argparse.ArgumentParser(add_help=True, description="DSH tool schema 合规检查/修复")
    ap.add_argument("file")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--fix", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--ap-value", default=None, choices=["true", "false"],
                    help="强制取值（默认按上下文自动判断）")
    args = ap.parse_args()

    path = Path(args.file)
    src = path.read_text(encoding="utf-8")
    lint = Lint(src, ap_value=args.ap_value)
    lint.run()

    result = {"file": str(path), "violations": lint.found, "count": len(lint.found), "fixed": False}

    if args.fix and lint.found:
        new_src = lint.apply()
        if not args.dry_run:
            path.write_text(new_src, encoding="utf-8")
        result["fixed"] = not args.dry_run

    if args.json:
        print(json.dumps(result, ensure_ascii=False))
    else:
        if not lint.found:
            print(f"OK   {path}")
        else:
            print(f"WARN {path}  ({len(lint.found)} 处)")
            for v in lint.found:
                print(f"   L{v['line']:<5} {v['code']}  {v['path']}")
                print(f"          {v['message']}  ->  {v['fix']}")
            if result["fixed"]:
                print("   已修复并写回")

    return 0 if (not lint.found or result["fixed"]) else 1


if __name__ == "__main__":
    sys.exit(main())
