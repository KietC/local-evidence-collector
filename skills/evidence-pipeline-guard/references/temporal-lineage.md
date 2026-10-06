# Time, source families, and lineage

A format is not a business schema. Generic JSON/HTML/SQLite parsing can preserve Bronze observations but cannot claim complete Silver message semantics.

Use exact source-family fingerprints and an explicit field contract for time, actors, recipients, reply/edit/delete/reaction/thread, and attachment edges. Preserve DOM attributes and MIME relationships rather than reducing everything to tag/text.

SQLite inputs need a verified consistent snapshot. For a live database, use the [Online Backup API](https://www.sqlite.org/backup.html); do not assume a copied main database or immutable read preserves its WAL state.

## Native locators

Keep source hash, container member, snapshot hash, native record locator, field pointer or byte range, and transformation history. JSON Pointer, SQLite table+PK, MIME part, HTML DOM/byte locator, document page, and OCR bounding box represent different coordinate systems.

Join lineage using exact identities. Title similarity may generate candidates, not prove provenance. Check publication-to-source graph reachability globally, collision detection, relation target existence, and duplicate IDs across shards.

## Temporal evidence

Keep sent, received, modified, archived, filesystem time, timezone, precision, raw-value hash, source field, and conflicts separately.

Do not promote filesystem mtime, an archive date, a message sequence, or a guessed numeric epoch unit to message time. Two copied observations from the same original field are one evidence group, not independent corroboration.

Suggested honest outcomes:

- `CORROBORATED_EXACT`: valid native time with genuinely independent corroboration.
- `CALIBRATED_NATIVE`: explicit family rule validated against an adequate independent Gold Set.
- `NATIVE_UNCALIBRATED`: native-looking value awaiting calibration.
- `INTERVAL_ONLY`: evidence supports bounds only.
- `SEQUENCE_ONLY`: evidence supports relative order only.
- `CONFLICT_QUARANTINED`: incompatible observations retained.
- `UNKNOWN`: no defensible time evidence.

Derive statistical accuracy from the sampling design and error counts; a small zero-error canary is not a 99.9% accuracy certificate. Recovery cannot invent time absent from original evidence.

Models and OCR outputs are derivatives. They do not overwrite source observations or make a chronological claim authoritative.

## 中文要点

文件格式不等于聊天系统 schema。时间必须保留原生字段语义和定位；顺序不是日期，同源复制不是多重印证。没有证据就未知，不使用模型猜时间。
