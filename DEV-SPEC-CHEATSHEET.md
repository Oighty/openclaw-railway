# /dev-* Commands Cheatsheet

Quick reference for the spec-generation skills:

## 1) Full pipeline

```text
/dev-spec <feature>
/dev-spec <path-to-concept.md>
```

Examples:

```text
/dev-spec auth-system
/dev-spec ./artifacts/auth-system/concept.md
```

Generates all artifacts:
- `./artifacts/{feature}/prd.md`
- `./artifacts/{feature}/sdd.md`
- `./artifacts/{feature}/dtp.md`

---

## 2) PRD only

```text
/dev-prd <feature>
/dev-prd <path-to-concept.md>
```

Input:
- `./artifacts/{feature}/concept.md` (or explicit path)

Output:
- `./artifacts/{feature}/prd.md`

---

## 3) SDD only

```text
/dev-sdd <feature>
/dev-sdd <path-to-prd.md>
```

Input:
- `./artifacts/{feature}/prd.md` (or explicit path)

Output:
- `./artifacts/{feature}/sdd.md`

---

## 4) DTP only

```text
/dev-dtp <feature>
/dev-dtp <path-to-sdd.md>
```

Input:
- `./artifacts/{feature}/sdd.md` (or explicit path)

Output:
- `./artifacts/{feature}/dtp.md`

---

## Typical workflow

1. Write `./artifacts/{feature}/concept.md`
2. Run `/dev-spec {feature}`
3. Review PRD → SDD → DTP outputs
4. Hand DTP to implementation agents/developers

---

## Notes

- Use feature names for default artifact paths.
- Use explicit file paths when you want to run a stage against a non-standard location.
- If intermediate artifacts already exist, `/dev-spec` should offer fresh vs resume behavior.
