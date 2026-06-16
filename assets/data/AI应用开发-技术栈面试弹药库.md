# AI 应用开发工程师 — 技术栈面试弹药库

> 结构对齐简历工作项。面试官追问哪个点，直接跳到对应章节。

---

# 一、IntelligentSystem 智能体工作流平台

## 1.1 健康检查子系统

### 为什么 45 个错误码要分类？if/else 不行吗？

最开始就是 if/else，但暴露了问题：上游传参错误和平台内部故障在代码里都是"失败了"，但前者不需告警后者必须告警。不分类的结果是要么漏报、要么滥报。

具体场景：上线初期健康检查只返回 pass/fail，所有失败统一当作"调用失败"处理。真正需要人工介入的平台故障（如 Coze 引擎内部队列阻塞）被淹没在大量"用户传了非法参数"的噪音里，运维收到告警也麻木了。

分类方案——按责任边界切成 4 类：

| errno 类 | 含义 | 例子 | 告警策略 |
|----------|------|------|---------|
| CALLER_CONTRACT | 调用方传参错误 | query 为空、KB 不存在 | 不告警，返回明确错误码 |
| WORKFLOW_INTERNAL | 工作流内部缺陷 | 节点配置错误、插件版本不兼容 | 告警通知用户 |
| PLATFORM_INFRA | 平台基础设施故障 | Coze 队列阻塞、MySQL 连接池耗尽 | 告警通知运维 |
| OPERATIONAL | 运维操作类 | 工作流被停止、服务暂停中 | 不告警，正常状态 |

分类把隐式判断显式化。解释器是纯函数——输入错误码，输出 errno 类和告警级别，不需要 Mock Coze 引擎就能单测全覆盖。

### "验证器 + 解释器"分离的设计动机

- 验证器：做 RPC 调用、收集 Coze 引擎返回的数据——有副作用，测试需要 Mock
- 解释器：纯函数，输入收集到的数据，输出健康判定——无副作用，单测零依赖

分开后解释器可以独立做全覆盖测试（正常/边界/异常），不依赖 Coze 引擎的可用性。验证器的测试只需要验证"数据收集行为是否正确"，不需要验证判定逻辑。

---

## 1.2 PAT 令牌安全存储

### 为什么要可逆加密？bcrypt 不行吗？

业务场景：用户发布工作流为 API 后，外部系统通过 Personal Access Token 调用。后端收到令牌后需要解密出原始 token，以用户身份代理调用 Coze API——这是**代理模式**，不是**认证比对模式**。

bcrypt 是单向哈希，只能"用户传明文、服务端比对哈希"，无法"服务端解密后用明文去调上游"。所以选了 Fernet（AES-128-CBC + HMAC-SHA256）：可逆解密 + HMAC 签名保证篡改可检测。

令牌仅在创建时返回一次明文，此后只存密文。

### 部分唯一索引解决什么问题？

软删除后用户想重建同名令牌——普通唯一索引会阻止（已删除记录仍占用名字）。部分唯一索引 `{name: 1, deleted_at: 1}` + `partialFilterExpression: {deleted_at: null}`：未删除记录名字唯一，已删除后可重建同名。软删除保留审计追溯的同时不阻塞正常操作。

---

## 1.3 执行快照压缩存储

### 为什么需要压缩？直接存 JSON 不行吗？

工作流每次试运行产生完整输入/输出 JSON，嵌套工作流节点可能有几十 KB。两个问题：

1. 列表页只需要"什么时候、什么状态、输入大概是什么"，不需要完整 JSON
2. MongoDB 文档体积大会拖慢列表查询

解法：gzip + base64 写入 `_bundle` 字段。列表接口只返回摘要（前 200 字符预览），详情接口按需解压返回完整内容。SHA-256 写入相邻字段，读取时校验——防止存储层静默损坏。

用户可收藏执行记录、复用历史输入一键重跑。

---

## 1.4 幂等性控制

### 幂等为什么不用数据库事务？

业务场景不是"极端情况下的防御"。前端调用后端 API 超时后，用户必然重试——这是正常用户行为，不是异常。后端可能已成功（只是响应没到达前端），重试就变成重复操作。

事务保证单次原子性（全成功或全回滚），不能阻止"用户发了两次同样请求"——两次请求是两个独立事务，各自原子提交，互不感知。

方案：以"操作类型 + 目标 ID + 参数哈希"生成请求指纹作为唯一键写入幂等记录集合，重复请求因唯一索引冲突直接返回首次缓存结果。7 天 TTL 索引自动清理，无需手动 GC。覆盖模板复制、工作流创建、知识库创建三个写路径。

### MongoDB 部分唯一索引 & TTL 索引还用在哪些场景？

- 部分唯一索引：PAT 令牌的 `{name + deleted_at}` 组合，软删除后可重建同名
- TTL 索引：幂等记录 7 天自动清理、限流窗口 key 自动过期

---

## 1.5 Coze 引擎集成

### Coze、LangChain、LlamaIndex 区别？怎么选？

- LlamaIndex 专注 RAG——索引构建、检索增强、评估，做检索管线顺手
- LangChain 更大更重，Agent/Memory/Tool/Chain 全包，简单事反而复杂
- Coze 是字节的 Agent 搭建引擎，我们用的是它的执行引擎但不直接用前端——自己包了一层做模板市场、健康监控、令牌管理

选型逻辑：不是"哪个最好"，而是"每个东西解决什么问题，你需要谁做得最干净"。

### 和 Coze 引擎的交互边界在哪？

IntelligentSystem 不实现工作流引擎。工作流的实际执行在 Coze Studio 里完成。平台做的是：
- 模板发布同步（`coze_publish_sdk` 离线 CLI，幂等 + dry-run）
- 工作流 CRUD 代理（后端转发到 Coze API）
- 知识库管理代理（KnowledgeAdapter V1/V2）
- 健康检查（验证器调 Coze RPC，解释器做判定）
- 执行历史（平台存储快照，不依赖 Coze 的存储）

### Coze v1 和 v2 怎么切换？

适配器模式。`KnowledgeAdapterV1` 和 `KnowledgeAdapterV2` 实现同一协议，`get_knowledge_adapter()` 根据环境变量 `COZE_VERSION` 选择实现。业务代码不感知版本差异。

### Coze 知识库的内部实现是怎样的？

Coze 内置 RAG 基础设施：MySQL (opencoze) 做元数据、Elasticsearch 做全文检索、Milvus 做向量检索、MinIO 做文件存储。平台通过 `/api/knowledge/*` 代理调用。

### IntelligentSystem 为什么不直接调用自研 rag 服务？

当前 IntelligentSystem 的知识库操作代理到 Coze 内置 RAG。自研 `rag` 服务是独立的检索引擎，有自己的一套 MongoDB + ES + MinIO + Redis 基础设施，当前唯一的外部消费者是 `rag-evaluation-platform`。

这个分离是有意的：
- 编排平台的价值在模板化、工作流管理、模型部署——RAG 只是其中一个环节
- 检索引擎可以独立升级分块策略和检索算法，不影响编排平台的稳定性
- 未来可以通过适配器模式让编排平台同时支持 Coze 内置 RAG 和自研引擎

---

# 二、RAG 知识库检索服务

## 2.1 PDF 格式自动检测与智能分流

### 检测错了会怎样？两种失败模式

调用方上传 PDF 时声明的 `source_modality` 经常错误。两种失败模式：

- **扫描件被标为文字型 PDF**：OCR 未执行，PyMuPDF 提取不到文字，最终 ES 里没有可检索的内容。用户看到"上传成功"但检索不到——静默失败，比直接报错更糟
- **文字型 PDF 被标为扫描件**：每一页送去 OCR，浪费 GPU 资源，且 OCR 识别可能引入错字，降低检索质量

### 怎么检测？为什么不用 ML 模型？

服务端不信任调用方声明。基于文件头 magic bytes + PyMuPDF 采样检测 PDF 内部是否包含 text stream。有文本流 → 文字型，直接文本提取。无文本流 → 扫描件，逐页渲染 + ThreadPoolExecutor 并发 OCR。

不引入 ML 分类模型的原因：magic bytes + text stream 检测准确率已经 >99%，不需要额外服务和延迟。工程选择——用最简单的方案解决绝大多数情况。

### 多模态文档摄取支持哪些格式？各走什么管线？

- TXT / Markdown：直接文本提取
- 文字型 PDF：PyMuPDF 提取文本
- 扫描 PDF：PyMuPDF 逐页渲染 → PaddleOCR → 文本合并
- DOCX：python-docx 提取文本 + 内嵌图片
- PNG / JPEG / WebP：原样作为 image_chunk 存储，经 Chinese-CLIP 向量化

---

## 2.2 多租户固定窗口限流器

### 固定窗口 vs 滑动窗口，为什么选前者？

业务场景：多租户，某个租户的突发上传不能影响其他租户。"精确控流"不是目标，"防单租户打爆"才是。

| | 固定窗口 | 滑动窗口 |
|---|---------|---------|
| 数据结构 | String + INCR + EXPIRE | Sorted Set + ZADD + ZREMRANGEBYSCORE + ZCARD |
| Redis 操作 | 2 次/请求 | 3 次/请求 |
| 边界精度 | 窗口边界瞬时可达 2x 限额 | 严格平滑 |
| 适用场景 | 防打爆（容忍瞬时超限） | 精确限流（不容忍超限） |

选了固定窗口——2x 瞬时流量在防单租户打爆场景可接受，用精度换简单。这个取舍写入了 ADR。

### 限流在请求链路中的位置？

在文件写入 MinIO 之前执行。超出了直接拒绝——不先存再删，不留下孤立对象。上传大小、速率限制、进行中任务上限三个维度都预先检查。

### 五种 Redis 基础数据结构？用了哪个？

String、Hash、List、Set、Sorted Set。限流器只用 String——`INCR` 是原子操作，天然适合做计数器。Key 格式 `ratelimit:{bucket}:{tenant_id}:{分钟级时间戳}`，EXPIRE 自动清理。

### 缓存穿透、击穿、雪崩？

- 穿透：查不存在的数据绕缓存直击 DB。防：布隆过滤器或缓存空值（短 TTL）
- 击穿：热点 key 过期瞬间大量请求打 DB。防：互斥锁，抢到锁的回写缓存
- 雪崩：大量 key 同时过期。防：TTL 加随机偏移

---

## 2.3 BGE-M3 / Chinese-CLIP 的 OpenAI 兼容 API 层

### 为什么需要兼容层？

模型服务原生接口与调用方习惯的 OpenAI SDK 格式不一致。实现兼容层后调用方可以 `openai.OpenAI(base_url="...")` 零改动接入。

### dimensions 参数的边界情况

BGE-M3 输出维度固定 1024。但调用方用 `openai` SDK 时，SDK 默认会传 `dimensions` 参数。如果服务端直接拒绝 → SDK 报错 → 调用方需要改代码，违背"零改动接入"目标。

处理：接受 `dimensions` 但不生效，始终返回 1024 维。`usage.prompt_tokens` 用模型真实 tokenizer（XLM-RoBERTa）计算，不是字符估算。

### BGE-M3 为什么一个模型输出三种向量？

- Dense（1024维）：语义相似度召回
- Sparse（词权重）：BM25 风格的词汇匹配，和 Dense 互补
- ColBERT（多向量）：token 级别的 MaxSim 精细化排序

一次前向传播同时产出三种表示，不需要部署三个模型。Sparse 向量序列化为并行 `indices`/`values` 数组，可直接对接 Qdrant、Milvus、Weaviate。

### SSRF 为什么是安全问题？防什么？

允许用户传入 URL 让服务端抓取（Chinese-CLIP 根据图片 URL 提取 embedding），攻击者可传 `http://169.254.169.254/latest/meta-data/` 窃取云服务器元数据（含 access key），或 `http://127.0.0.1:6379/` 攻击内网服务。

防护链：DNS 解析 → 检查 IP 是否私有/环回/链路本地 → Content-Type 白名单（image/jpeg, image/png, image/webp）→ 禁用重定向 → 流式读控大小（默认 10MB 上限）。

---

## 2.4 检索评估框架与端到端验证

### 48 组实验的结论是什么？

实验不是为了展示规模，是为了回答一个工程问题：生产环境的默认检索策略用什么？

3 种召回模式（Dense / BM25 / Dense+BM25）× 8 种查询增强（无/重写/扩展/多查询及其组合）× 2 种重排序（开/关）= 48 组。

结论：BM25 + Dense 混合召回 + 查询重写 + Rerank 在大多数场景下获得最佳精度-延迟平衡。这个组合成为生产默认配置，不是拍脑袋定的。

### 30+ Smoke 脚本覆盖了什么？

覆盖全部 7 条检索链路，每次部署前自动运行，不需启动 HTTP 服务即可端到端验证：

- 文本 dense 召回
- BM25 全文召回
- 图像向量召回
- Dense + BM25 混合检索
- RRF 融合
- 跨知识库检索
- 重排序管线

### Rerank 为什么需要？直接向量检索不行吗？

向量检索是语义相似度，不是问题-答案匹配度。Rerank 用 Cross-Encoder（BGE-Reranker-v2-m3）把问题和候选文档成对打分，精度远高于单塔向量检索。代价是慢，所以只对 Top-K（默认 20）做 Rerank——BM25 粗排 → Rerank 精排。

---

## 2.5 检索引擎架构

### 五层分层设计

```
app/api/ + app/middlewares/     ← HTTP 协议入口
app/policy/                     ← 参数合并 + 能力验证
app/services/ + app/orchestrators/  ← 业务编排
app/executors/ + app/llamaindex/    ← 原子能力
app/infrastructure/                 ← DB/搜索/存储/队列
```

向下依赖，不可逆。单元测试强制校验层边界。

### 参数的三层优先级合并

请求参数 > KB 默认值 > 系统默认值。合并后生成不可变 `ResolvedPolicy` 值对象，携带 `resolved_from` 审计追踪——下游代码不需要重新判断"这个值从哪来的"。

### 为什么用 Elasticsearch 而不是 Milvus/Pinecone？

同时需要 Dense KNN + BM25 全文检索 + 元数据过滤。ES 是唯一一个三个能力都在单一系统里做得好的。每个 KB 一个索引，索引 mapping 同时承载 `text_vector` 和 `image_vector` 两个 dense_vector 字段。

### 双重可见性门控

MongoDB 的 `doc_status` 和 ES 的 `doc_status` 必须同时为 `ready`，块才对检索可见。原子翻转防止摄取过程中间态数据被检索到。

### 为什么封装 LlamaIndex 而不是直接用？

LlamaIndex SDK 完全隐藏在 `app/llamaindex/` 适配器层内。服务和编排器只通过稳定的管道构建器接口使用。收益：LlamaIndex 版本升级只需改适配器层，业务代码不受影响。

### 检索链路的数据流

```
POST /api/v1/retrieval
  → 限流检查
  → 加载 KB，验证文档范围
  → 查询策略执行（LLM 重写/扩展/多查询，失败优雅降级）
  → Embedding 生成（文本查询向量或图像查询向量）
  → 并行检索：Dense KNN + BM25 + 图像向量
  → 文本侧 RRF 融合（Dense + BM25，加权）
  → 可选 BGE-Reranker 重排序
  → 跨 KB RRF 融合
  → min_score 过滤 + max_tokens 截断
  → 返回 items[] + debug{}
```

---

# 三、通用技术基础

## 3.1 Python 核心

### async/await 做了什么？和线程有什么区别？

协程，单线程内通过事件循环切换。和线程的关键区别：线程切换靠操作系统抢占，协程切换靠 `await` 主动让出——没有 GIL 竞争、没有线程切换开销、不需要锁保护共享数据。FastAPI 路由全是 `async def`，检索链路大部分时间在等 I/O，协程可以处理其他请求。

### GIL 是什么？FastAPI 怎么绕？

GIL 限制同一时刻一个线程执行 Python 字节码。I/O 密集型不受影响——线程等 I/O 时会释放 GIL。FastAPI 的 async/await 是单线程协程模型，天然绕开。CPU 密集时用 `run_in_executor` 扔到进程池。

### generator 和 async generator 区别？

generator（`yield`）同步产出值。async generator（`async yield`）每次产出前可以 `await`。FastAPI `StreamingResponse` 靠 async generator 实现边算边推。

### 装饰器原理？带参数的装饰器？

本质是 `fn = decorator(fn)` 语法糖。带参数的装饰器多一层嵌套：`decorator_factory(arg) → decorator → wrapper → 调用原函数`。FastAPI 的 `@app.get("/path")` 就是带参数的装饰器。

---

## 3.2 FastAPI + Pydantic

### async def vs def 路由函数？

函数体有 I/O 等待 → `async def`，放事件循环不阻塞其他请求。纯 CPU 计算 → `def`，丢线程池执行。

### 依赖注入怎么用？

`Depends` 在路由函数调用前解析依赖。项目里用 Settings（Pydantic BaseSettings）做全局配置注入，`get_db()` 做 MongoDB 连接注入。核心收益：路由函数只关心业务逻辑，横切关注点由框架统一处理。

### Pydantic v2 vs v1？

v2 核心用 Rust 重写了序列化引擎（pydantic-core），速度提升 5-50x。`model_dump()` 替代 v1 的 `.dict()`。

### 请求体太大怎么限制？

文件上传场景：限流在文件写入 MinIO 之前检查，超出拒绝不先存再删。纯请求体大小可用 middleware 检查 `Content-Length` 头。

---

## 3.3 MongoDB

### 什么时候用 MongoDB 而不是关系型？

适合：文档结构多变（不需预定义 schema）、嵌套数据不需 JOIN、快速迭代不改表。RAG 项目知识库的文档元数据字段不固定——PDF 有页数、图片有尺寸、Markdown 有标题层级。IntelligentSystem 工作流定义是嵌套 JSON。

### 聚合管道和 SQL 对应关系

| 聚合操作 | SQL 等价 |
|----------|---------|
| `$match` | WHERE |
| `$group` | GROUP BY |
| `$project` | SELECT |
| `$sort` | ORDER BY |
| `$lookup` | LEFT JOIN |
| `$unwind` | 数组展开 |

---

## 3.4 Elasticsearch

### 倒排索引为什么比 MySQL LIKE 快？

倒排索引是"词 → 文档列表"的映射。搜"RAG"直接查词典定位。MySQL LIKE '%RAG%' 扫全表逐行匹配。O(词项数) vs O(总文档数 × 平均长度)。

### BM25 relevance score 怎么算？

三个输入：词频（TF，饱和递减）、逆文档频率（IDF，常见词权重低）、文档长度归一化（短文档加分更多）。RAG 检索以 BM25 为 baseline，后面接 Reranker 精排。

### 调过搜索质量吗？

- 索引层：分词器选型（IK Analyzer / jieba）、字段映射（text 分词搜索 vs keyword 精确匹配）
- 查询层：多字段权重（标题 3x 正文）、minimum_should_match
- Rerank 层：Cross-Encoder 对 Top-K 重排序

---

## 3.5 工程通用

### 为什么写 ADR？

不是记录"最终做了什么"，而是记录"在多个方案中选了哪个、为什么"。比如限流选固定窗口——只写"实现了固定窗口"半年后接手的人不知道为什么，可能"优化"成滑动窗口踩坑。ADR 是给未来维护者留上下文。

### 测试策略？

- RAG 项目：30+ Smoke 脚本（端到端，覆盖 7 条链路，不需启动 HTTP 服务）+ IR 引擎 20+ 单元测试
- IntelligentSystem：解释器设计成纯函数，独立单测不需要 Mock Coze 引擎
- 测试写多少取决于模块的失效代价——检索挂了直接影响上游 Agent 回答质量，覆盖最密

### Router → Service → Repository 三层是不是过度设计？

分开的核心收益：换存储层不影响业务逻辑（Repository 切换），加缓存不影响接口层（Service 层加）。RAG 项目涉及 ES/Redis/MinIO 多个后端，不拆分一个路由函数里糅杂五六种外部调用，调试和测试都痛苦。

### 异步任务为什么用 Celery 而不是 ThreadPoolExecutor？

文档摄取涉及 OCR（CPU 密集）、Embedding 调用（网络 I/O）、ES 写入（网络 I/O），执行时间可能几分钟。Celery + Redis 提供任务队列、重试机制、状态追踪、Worker 独立扩缩容。ThreadPoolExecutor 适合短任务，长任务没有持久化和重试能力。

### 检索链路为什么用 ThreadPoolExecutor 而不是 async/await？

检索侧的多召回器（Dense + BM25 + Image Vector）是并行 I/O 密集操作，但 LlamaIndex 和 ES Python 客户端底层的 HTTP 调用是同步的。`asyncio.to_thread()` 把同步调用扔进线程池，用 `concurrent.futures` 收集结果。本质是"用线程池模拟异步并行"——不是不想用 async，是依赖库不支持。

### 多模态检索的核心挑战是什么？

文本和图片的 Embedding 不在同一个向量空间。Chinese-CLIP 虽然图文共享语义空间，但与 BGE-M3 的 1024 维 dense 向量完全不可比。所以设计上是：
- 每个 KB 的每次检索独立生成查询向量
- 各 KB 独立 recall → 独立 fuse
- 只在业务层做 RRF 跨库聚合——聚的是排名分数，不是向量
- 禁止"把一个 KB 的向量拿到另一个 KB 的索引里去搜"——没有意义

---

## 2.6 RAG 评测平台 — 可插拔引擎与 LLM-as-Judge

### 评测平台解决什么问题？

团队不断调整分块策略、检索参数、Rerank 阈值——但改完不知道效果变好了还是变差了。评测平台提供标准化的「数据集 → 评测任务 → 指标报告」闭环，让每次改动都有数据支撑而不是凭感觉。

### 可插拔引擎架构怎么设计的？

`EvaluationEngine` 抽象基类定义四个接口：
- `get_name()` → 引擎标识
- `get_supported_metrics()` → 返回该引擎支持的指标列表，包含 required_fields（哪些数据集字段是必需的）
- `validate_config(config)` → 校验引擎配置是否合法
- `evaluate(items, metrics, config, progress_callback)` → 异步执行评测

三个内置引擎：
- **RagasEngine**：LLM-as-Judge + 离线启发式双模式，覆盖 Faithfulness、Answer Relevancy、Context Precision/Recall 等 10 项指标
- **IREngine**：经典 IR 指标，Hit Rate/MRR/nDCG/Recall@K/Precision@K，纯数学计算，不依赖 LLM
- **CustomEngine**：关键词覆盖率和精确匹配，支持用户自定义指标

新引擎实现接口后只需一行注册，核心服务代码零改动。

### IR 引擎的三种匹配模式是什么？

这是评测检索质量的核心——"检索到的文档"和"应该检索到的文档"怎么比？

- **`doc_id` 模式**（默认）：比较 `retrieved.doc_id` vs 黄金标准的 `relevant_doc_ids`。精确、快速，但要求数据集的 doc_id 准确
- **`content` 模式**：双向子串匹配检索到的 chunk 文本 vs 黄金标准的 `relevant_contexts`。用于 doc_id 不可靠的场景——比如 RAG 的 ES 里 doc_id 是内部生成的 ID，而黄金标准里是业务层 ID
- **`auto` 模式**：先试 doc_id，不匹配自动降级到 content。默认推荐

一个坑：如果 RAG pipeline 没执行（测试的检索还是黄金标准本身），评测分数会虚高到接近满分——因为「检索到的」恰好等于「期望检索的」。IR 引擎对此加了退化检测：如果所有检索结果都是黄金数据本身，记录警告日志并将分数归零。

### Ragas 引擎的离线启发式模式是什么？

Ragas 官方需要调 LLM 做评判，成本高（一次评测上百条数据，每条调几次 LLM，几块钱就没了）且依赖外部 API 稳定性。离线模式用 Token 重叠率做快速估算：

- Faithfulness = answer 与 contexts 的 token 重叠率（回答是否来自上下文）
- Answer Relevancy = question 与 answer 的 token 重叠率（回答是否扣题）
- Context Precision = ground_truth 与 contexts 的 token 重叠率（检索是否命中）
- Context Recall = contexts 与 ground_truth 的 token 重叠率（检索是否完整）

不精确，但足够在开发迭代中快速对比"改之前 vs 改之后"的相对变化——不需要精确值，只需要知道方向对不对。正式报告再切到 ragas 模式用真实 LLM。

### LLM-as-Judge 的评判结果可信吗？

Ragas 的 faithfulness 用 LLM 把回答拆成"声明"列表，然后逐一检查每个声明是否被上下文支持。这比整段回答端到端打分更细粒度、更可解释。但 LLM-as-Judge 有两个局限：
- 模型自身的偏见：训练数据里见过的模式可能会影响判断
- 成本：每条数据可能调 3-5 次 LLM

项目里的做法：离线模式做快速迭代 → ragas 模式做正式报告 → 人工抽样验证——不把 LLM 评分当绝对真理，当统计参考。

### 评测任务为什么用 Celery 异步执行？

一次评测可能几百条数据，每条调 LLM（ragas 模式）或 Embedding 服务，可能跑几分钟到半小时。同步执行会超时、会阻塞 API 进程。Celery Worker 异步执行，`progress_callback` 定期更新 MongoDB 中的 `progress` 字段，前端每 3 秒轮询一次直到状态变为 terminal。

取消是协作式的：Worker 每处理完一条数据就检查 MongoDB 里的状态是否为 `canceled`，是则主动抛异常终止。

---

## 2.7 Embedding 模型推理服务 — 多模型 GPU 托管

### 为什么一个进程里加载三个模型？

BGE-M3（文本 Embedding，~2.2GB）、Chinese-CLIP（图文双塔，~600MB）、BGE-Reranker-v2-m3（交叉编码器，~1.5GB）。拆成三个微服务的好处是独立扩缩容——但 GPU 机器有限时，三个容器各自加载 PyTorch 和 CUDA runtime，重复占用显存。单进程三模型共享 PyTorch runtime，GPU 内存更省。

### 信号量并发控制怎么设计的？

每个模型族有自己的 `asyncio.Semaphore`（默认宽度=2），三模型三个独立信号量。超时等待返回 HTTP 503 + `Retry-After: 1`。

为什么不用全局信号量（比如总宽度=4，三模型共享）？因为三模型显存占用和推理耗时不同——全局信号量=4 时，可能出现 4 个 Reranker 请求同时打进来 OOM，但不会同时有 4 个 Embedding 请求。独立控制让运维按每个模型的显存消耗和 GPU 余量分别调参。

代价：运维需要了解三模型的显存占用。但这是生产 GPU 推理的基本功，不值得用 OOM 风险换省事。

### BGE-M3 为什么同时输出三种向量？各用在哪？

一次前向传播同时产出：
- **Dense**（1024 维 float）：语义相似度召回——"意思相近"的文档
- **Sparse**（token_id → weight 字典）：词汇级别匹配——"包含相同关键词"的文档，和 BM25 同类但由模型学出词权重
- **ColBERT**（每个 token 一个向量）：精细排序——查询和文档的 token 两两算相似度，MaxSim 聚合

只用 Dense 会漏掉关键词匹配（"RAG"和"retrieval-augmented generation"语义近但字符完全不同），只用 Sparse 会漏掉同义表达。Dense + BM25/sparse 混合 + Rerank 是当前召回精度最优组合。

### Chinese-CLIP 的图文共享语义空间是什么意思？

文本"一只猫"和猫的图片经过同一模型编码后，向量余弦相似度高。这让"用图片搜图片"和"用文字搜图片"都能工作——不需要分别建两个索引。

RAG 里的应用场景：用户上传产品说明书扫描件，OCR 提取文字存 text_chunk，原始截图存 image_chunk——用户文字搜"产品参数"能找到，用户传一张截图也能找到同一页。

### SSRF 防护为什么重要？

允许用户传入 URL 让服务端抓取图片做 embedding。攻击者传 `http://169.254.169.254/latest/meta-data/` 窃取云服务器元数据（含 access key），或 `http://127.0.0.1:6379/` 攻击内网 Redis。

防护链：DNS 解析所有 IP → 逐一检查是否私有/环回/链路本地/多播 → 禁止 HTTP 重定向（防重定向到内网）→ Content-Type 只允许 image/jpeg, image/png, image/webp → 流式读取 + 实时累加字节，超 10MB 拒绝。

唯一的已知缺口是 TOCTOU（DNS 解析与 TCP 连接之间的时间窗口，攻击者在这期间修改 DNS 记录）。内网可信客户端场景下可接受，已有 ADR 记录待后续增强。

---

## 2.8 文档摄入流水线 — 从上传到可检索

### 五阶段异步流水线的每个阶段做什么？

上传接口同步返回 `{doc_id, task_id, status: "pending"}`——不等待处理完成。Celery Worker 异步执行：

1. **Parse**：根据文件类型分发解析器（PDF→PyMuPDF，DOCX→python-docx，图片→PIL，Markdown/TXT→直接读文本），扫描 PDF 逐页渲染为 PNG → ThreadPoolExecutor 并发调 OCR
2. **Normalize**：空白字符规范化（全角→半角、多余换行→单个换行），保留段落结构和自然换行
3. **Split**：LlamaIndex `DocumentPolicyNodeParser`，按段落/标题/Markdown 标题层级切分，chunk_size 和 chunk_overlap 可配
4. **Embed**：文本 chunk → BGE-M3 生成 dense vector，图片 chunk → Chinese-CLIP 生成 image vector，批量 HTTP 调用
5. **Index**：ES bulk write，同时翻转 doc_status 从 processing → ready

### Docx 引擎的 OCR 调用为什么用 ThreadPoolExecutor？

扫描 PDF 几十页，每页渲染成一张 PNG 后发 OCR 请求。如果每页串行调 OCR（一页 2 秒，30 页就 60 秒），体验极差。ThreadPoolExecutor 并发多页 OCR（最大每页并发数 `ocr_per_page_concurrency` 可配，默认 4），30 页变成 ~8 批 × 2 秒 ≈ 16 秒。

### Rerank 为什么放最后而不是放 fusion 之前？

Cross-Encoder（BGE-Reranker-v2-m3）把 query 和每个候选文档拼接后过一遍 transformer，精度远高于双塔向量检索——但慢，O(N) 次推理。召回层可能返回几十条候选，全 Rerank 代价太大。所以：Dense+BM25 粗排（取 candidate_k 条，比如 200）→ RRF 融合 → 取 top_k 条（比如 20）→ Rerank 精排。这个两阶段策略把 Rerank 的调用次数从 200 降到 20。

### ES 索引的 mapping 设计有什么讲究？

顶层 `dynamic: strict`——新字段必须显式声明，防止调用方误传 `metadata.score: "0.95"` 第一次推导为 text 类型、后面传 `0.95`（float）写入失败。

四个子对象 `metadata`、`source`、`position`、`modality_payload` 内部 `dynamic: true`——用户自定义的 metadata 字段随便加，不影响核心检索字段的 mapping。

一个索引同时承载 `text_vector` 和 `image_vector` 两个 `dense_vector` 字段，通过 `chunk_type` 区分——文本查询只搜 text_vector，图片查询只搜 image_vector，不用建两个索引。

---

## 2.9 全局模型目录 — 统一接入层

### 为什么需要模型目录？

系统依赖 Text Embedding / Image Embedding / OCR / Rerank / LLM 五种外部模型服务。每种模型服务的地址、API Key、能力声明各不相同——如果散落在代码各处，换一个模型要改多处代码。模型目录提供统一注册入口：JSON 配置文件 → 启动时加载 → 同步到 MongoDB → 通过 `model_id` 全局引用。

### 每个知识库为什么强制绑定模型且不可变？

KB 创建时选定 text_embedding_model_id 和 image_embedding_model_id——之后不可修改。两组配置（base_url、dimensions、model_name）以不可变快照记录在 `model_bindings` 字段。

如果模型可随意更换，已入 ES 的所有 chunk vector 全部作废（维度可能不同、语义空间可能不同），需要重建索引。当前版本不支持 re-vectorization，所以模型绑定在 KB 生命周期内不可变。这是工程取舍——宁可限制灵活性，也不要静默的数据不一致。

---

# 三、通用技术基础

## 3.1 Python 核心

### async/await 做了什么？和线程有什么区别？

协程，单线程内通过事件循环切换。和线程的关键区别：线程切换靠操作系统抢占，协程切换靠 `await` 主动让出——没有 GIL 竞争、没有线程切换开销、不需要锁保护共享数据。FastAPI 路由全是 `async def`，检索链路大部分时间在等 I/O，协程可以处理其他请求。

### GIL 是什么？FastAPI 怎么绕？

GIL 限制同一时刻一个线程执行 Python 字节码。I/O 密集型不受影响——线程等 I/O 时会释放 GIL。FastAPI 的 async/await 是单线程协程模型，天然绕开。CPU 密集时用 `run_in_executor` 扔到进程池。

### generator 和 async generator 区别？

generator（`yield`）同步产出值。async generator（`async yield`）每次产出前可以 `await`。FastAPI `StreamingResponse` 靠 async generator 实现边算边推。

### 装饰器原理？带参数的装饰器？

本质是 `fn = decorator(fn)` 语法糖。带参数的装饰器多一层嵌套：`decorator_factory(arg) → decorator → wrapper → 调用原函数`。FastAPI 的 `@app.get("/path")` 就是带参数的装饰器。

---

## 3.2 FastAPI + Pydantic

### async def vs def 路由函数？

函数体有 I/O 等待 → `async def`，放事件循环不阻塞其他请求。纯 CPU 计算 → `def`，丢线程池执行。

### 依赖注入怎么用？

`Depends` 在路由函数调用前解析依赖。项目里用 Settings（Pydantic BaseSettings）做全局配置注入，`get_db()` 做 MongoDB 连接注入。核心收益：路由函数只关心业务逻辑，横切关注点由框架统一处理。

### Pydantic v2 vs v1？

v2 核心用 Rust 重写了序列化引擎（pydantic-core），速度提升 5-50x。`model_dump()` 替代 v1 的 `.dict()`。

### 请求体太大怎么限制？

文件上传场景：限流在文件写入 MinIO 之前检查，超出拒绝不先存再删。纯请求体大小可用 middleware 检查 `Content-Length` 头。

---

## 3.3 MongoDB

### 什么时候用 MongoDB 而不是关系型？

适合：文档结构多变（不需预定义 schema）、嵌套数据不需 JOIN、快速迭代不改表。RAG 项目知识库的文档元数据字段不固定——PDF 有页数、图片有尺寸、Markdown 有标题层级。IntelligentSystem 工作流定义是嵌套 JSON。

### 聚合管道和 SQL 对应关系

| 聚合操作 | SQL 等价 |
|----------|---------|
| `$match` | WHERE |
| `$group` | GROUP BY |
| `$project` | SELECT |
| `$sort` | ORDER BY |
| `$lookup` | LEFT JOIN |
| `$unwind` | 数组展开 |

---

## 3.4 Elasticsearch

### 倒排索引为什么比 MySQL LIKE 快？

倒排索引是"词 → 文档列表"的映射。搜"RAG"直接查词典定位。MySQL LIKE '%RAG%' 扫全表逐行匹配。O(词项数) vs O(总文档数 × 平均长度)。

### BM25 relevance score 怎么算？

三个输入：词频（TF，饱和递减）、逆文档频率（IDF，常见词权重低）、文档长度归一化（短文档加分更多）。RAG 检索以 BM25 为 baseline，后面接 Reranker 精排。

### 调过搜索质量吗？

- 索引层：分词器选型（IK Analyzer / jieba）、字段映射（text 分词搜索 vs keyword 精确匹配）
- 查询层：多字段权重（标题 3x 正文）、minimum_should_match
- Rerank 层：Cross-Encoder 对 Top-K 重排序

### kNN 的 num_candidates 为什么设为 candidate_k × 4？

ES 的 kNN 先做近似最近邻搜索（HNSW 图），num_candidates 控制搜索的候选池大小。太小可能漏掉真正的 top-K，太大性能下降。×4 是 ES 官方推荐的经验值——在召回精度和搜索延迟之间的平衡点。

---

## 3.5 工程通用

### 为什么写 ADR？

不是记录"最终做了什么"，而是记录"在多个方案中选了哪个、为什么"。比如限流选固定窗口——只写"实现了固定窗口"半年后接手的人不知道为什么，可能"优化"成滑动窗口踩坑。ADR 是给未来维护者留上下文。

### 测试策略？

- RAG 项目：30+ Smoke 脚本（端到端，覆盖 7 条链路，不需启动 HTTP 服务）+ IR 引擎 20+ 单元测试
- IntelligentSystem：解释器设计成纯函数，独立单测不需要 Mock Coze 引擎
- 测试写多少取决于模块的失效代价——检索挂了直接影响上游 Agent 回答质量，覆盖最密

### Router → Service → Repository 三层是不是过度设计？

分开的核心收益：换存储层不影响业务逻辑（Repository 切换），加缓存不影响接口层（Service 层加）。RAG 项目涉及 ES/Redis/MinIO 多个后端，不拆分一个路由函数里糅杂五六种外部调用，调试和测试都痛苦。

### 异步任务为什么用 Celery 而不是 ThreadPoolExecutor？

文档摄取涉及 OCR（CPU 密集）、Embedding 调用（网络 I/O）、ES 写入（网络 I/O），执行时间可能几分钟。Celery + Redis 提供任务队列、重试机制、状态追踪、Worker 独立扩缩容。ThreadPoolExecutor 适合短任务，长任务没有持久化和重试能力。

### 做过哪些性能优化？

- Embedding 调用：多查询变体合并为一次批量 HTTP 调用，减少往返
- Rerank：只对 Top-K（20 条）精排，不是全量 Rerank
- ES kNN：num_candidates = candidate_k × 4，平衡召回率与延迟
- PDF 文本检测：采样前 3 页而非全量扫描，大 PDF 秒级判断
- OCR 并发：ThreadPoolExecutor per-page 并发，30 页从串行 60s 降至 ~16s
- gzip+base64 压缩：工作流执行快照从几十 KB 压到几 KB，列表查询不拉全量

### 遇到过什么有意思的 Bug？

1. **OpenAI SDK 传 dimensions 导致报错**：BGE-M3 固定 1024 维，但 `openai` SDK 发送 `dimensions` 参数。最初直接拒绝——SDK 报错——调用方需要改代码，违背"零改动接入"目标。改为接受但不生效，SDK 安静工作。

2. **IR 引擎的退化自比较**：测试 RAG pipeline 时忘记先执行检索更新数据集，结果"检索到的"就是黄金标准本身，评测分数接近满分。加了退化检测：如果所有 retrieved == 黄金标准，记录警告并将分数归零。

3. **PDF 文本检测 20 字符阈值曾引发假阴性**：扫描件封面（纯白，无文字）被 PyMuPDF 提取出 0 个字符，但有些带水印的扫描件能提取出个位数的控制字符——初始阈值设太低（5 字符），带水印扫描件被误判为文字型。调试后设为 20——采样前 3 页，每页 ≥20 字符才算 text_source。

4. **限流器边界问题**：Redis 的 INCR 和 EXPIRE 是两个独立操作，不是原子的。如果 INCR 成功但 EXPIRE 失败（极端情况 Redis 宕机），key 永不过期——counter 永久冻结。解：EXPIRE 设 `window_seconds + 1` 留缓冲，加上 Redis 的 `maxmemory-policy` 做最后兜底。
