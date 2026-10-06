# Multicore throughput and safe recovery

## First identify the bottleneck

Measure completed records/s, CPU-seconds/wall-second, I/O, writer growth, queue depth, memory peak, and serial tail. Distinguish scheduler overhead, GIL, whole-file rereads, memory bandwidth, skew, global SQL operators, checkpoint, and GPU decoding.

Low CPU is not necessarily disk bandwidth saturation. More workers cannot split an already-running oversized Future.

## Decompose work

Use weighted reclaimable microshards, more shards than workers, and format-aware ranges:

- JSONL: safe newline byte ranges and stable global line ordinals.
- JSON arrays: validated object offsets or a streaming index.
- SQLite: snapshot + PK/rowid ranges.
- HTML/MIME: event/container/part boundaries.
- PDF: page ranges.
- OOXML: package members and relationship graph, with expansion limits.

Workers read their own paths and write independent Parquet fragments plus receipts. Avoid sending large records through Python Queue/pickle and avoid repeated reads from the beginning for every shard.

For a high-core Windows host, 32 workers followed by one safe expansion to 96 is a project policy, not a universal optimum. More than 61 ProcessPoolExecutor workers require separate pools; two 48-worker pools are one compatible layout. [Python documentation](https://docs.python.org/3/library/concurrent.futures.html#concurrent.futures.ProcessPoolExecutor)

Do not apply this topology to tiny static scans. For large-file hashing, benchmark a bounded thread pool and large chunks; hashlib releases the GIL for inputs larger than 2047 bytes. [hashlib](https://docs.python.org/3/library/hashlib.html)

## Admission and pressure

Use a bounded representative canary, not repeated competing full runs. Projected RAM includes parent, writer, per-worker peak, duplicated caches, and margin. Admission must also budget temporary disk growth and free space.

Pressure keeps concurrency at the admitted smaller setting. Stop admitting new shards before pressure is critical; checkpoint and drain/stop through documented ownership. Do not claim ordinary CPU saturation itself is an error.

Limit nested OpenMP/BLAS/Arrow threads inside worker processes. A single DuckDB writer may execute internally parallel queries, but not every operator scales. Parquet row groups need enough independent scan units. See [DuckDB workload tuning](https://duckdb.org/docs/stable/guides/performance/how_to_tune_workloads).

Publish a base epoch and independently bound FTS/OCR/semantic derivatives when the user allows preliminary delivery. An FTS index is not automatically maintained after base-table updates. See [DuckDB FTS](https://duckdb.org/docs/stable/core_extensions/full_text_search).

## Checkpoint and ETA

Re-use valid shard receipts, do not reprocess the same input/config/code/dependency key. On a changed binding, create a successor and explicitly map reuse.

Estimate remaining work using sustained valid-output throughput, not brief GPU peaks or the first batch. Report unknown tail cost separately.

## 中文要点

先拆可独立执行的小任务，再增加核心。32 到 96 是特定项目的安全扩容策略，不是所有脚本的默认值。内存、临时磁盘、尾部倾斜和实际算子吞吐决定并发，不能强迫所有阶段固定 95% CPU。
