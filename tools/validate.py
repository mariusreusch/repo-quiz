#!/usr/bin/env python3
"""Validate data/questions.json — run before committing catalogue changes.

    python3 tools/validate.py
"""
import json, sys, collections, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
data = json.loads((ROOT / "data" / "questions.json").read_text(encoding="utf-8"))

errors, warnings = [], []
topics = {t["id"]: t for t in data["topics"]}
sources = data["sources"]
seen_ids, seen_text = set(), {}

for q in data["questions"]:
    qid = q.get("id", "<no id>")
    if qid in seen_ids:
        errors.append(f"{qid}: duplicate id")
    seen_ids.add(qid)

    for field in ("topic", "subtopic", "difficulty", "question", "options", "answer", "explanation", "sources"):
        if field not in q:
            errors.append(f"{qid}: missing field '{field}'")
    if errors and any(qid in e for e in errors[-6:]):
        continue

    if q["topic"] not in topics:
        errors.append(f"{qid}: unknown topic '{q['topic']}'")
    elif q["subtopic"] not in topics[q["topic"]]["subtopics"]:
        errors.append(f"{qid}: subtopic '{q['subtopic']}' not declared on topic '{q['topic']}'")

    if len(q["options"]) != 4:
        errors.append(f"{qid}: expected 4 options, found {len(q['options'])}")
    if len(set(q["options"])) != len(q["options"]):
        errors.append(f"{qid}: duplicate option text")
    if not isinstance(q["answer"], int) or not 0 <= q["answer"] < len(q["options"]):
        errors.append(f"{qid}: answer index out of range")
    if q["difficulty"] not in (1, 2, 3):
        errors.append(f"{qid}: difficulty must be 1, 2 or 3")
    if not q["sources"]:
        errors.append(f"{qid}: no sources given")
    for s in q["sources"]:
        if s not in sources:
            errors.append(f"{qid}: unknown source key '{s}'")
    if len(q.get("explanation", "")) < 40:
        warnings.append(f"{qid}: very short explanation")

    key = q["question"].strip().lower()
    if key in seen_text:
        errors.append(f"{qid}: question text duplicates {seen_text[key]}")
    seen_text[key] = qid

declared = data["meta"].get("questionCount")
if declared != len(data["questions"]):
    errors.append(f"meta.questionCount is {declared} but the file holds {len(data['questions'])} questions")

for t in data["topics"]:
    used = {q["subtopic"] for q in data["questions"] if q["topic"] == t["id"]}
    for s in t["subtopics"]:
        if s not in used:
            warnings.append(f"topic '{t['id']}': subtopic '{s}' has no questions")

by_topic = collections.Counter(q["topic"] for q in data["questions"])
by_diff = collections.Counter(q["difficulty"] for q in data["questions"])

for w in warnings:
    print(f"warning: {w}")
for e in errors:
    print(f"ERROR:   {e}")

print(f"\n{len(data['questions'])} questions · {len(topics)} topics · "
      f"{len({(q['topic'], q['subtopic']) for q in data['questions']})} subtopics")
print("difficulty:", ", ".join(f"{k}={v}" for k, v in sorted(by_diff.items())))
print("per topic: ", ", ".join(f"{k}={v}" for k, v in by_topic.most_common()))

sys.exit(1 if errors else 0)
