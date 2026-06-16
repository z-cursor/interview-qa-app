# 面试题库（统一格式）

---

### Q: Q31: 什么是 LoRA？它如何在不更新全部参数的情况下微调大模型？

十一、模型微调与 PEFT — Q31: 什么是 LoRA？它如何在不更新全部参数的情况下微调大模型？

**答案**：

题目解析：LoRA 是目前最主流的参数高效微调（PEFT）方法，AI Agent 岗位涉及模型定制时必考。

题目讲解：
LoRA（Low-Rank Adaptation）核心思想：
预训练模型的权重矩阵 W（d×k）在微调时的变化量 ΔW 具有低秩特性。LoRA 不直接更新 W，而是将 ΔW 分解为两个低秩矩阵的乘积：
```
ΔW = BA,  其中 B ∈ ℝ^(d×r), A ∈ ℝ^(r×k), r << min(d,k)
前向计算: h = Wx + BAx = (W + BA)x
```
- 冻结原始权重 W，只训练 A 和 B（初始化：A 随机，B 为零，保证初始 ΔW=0）
- 参数量：d×k（原始）→ r×(d+k)（LoRA），r=8 时参数减少 100 倍以上

训练优势：
- 显存占用大幅降低（只需存 A、B 的梯度和优化器状态）
- 推理时可以把 BA 合并回 W，无额外推理延迟
- 可以针对不同任务训练多个 LoRA adapter，按需切换（不改变基础模型）

超参数：
- `r`（秩）：越大表达能力越强，但参数越多；通常 4-64
- `alpha`（缩放）：ΔW 的缩放系数 = alpha/r，通常 alpha=2r
- 目标模块：通常对 Q、V 注意力矩阵做 LoRA，有时也对全连接层

进阶变体：
- QLoRA：量化基础模型（4-bit NF4）+ LoRA，7B 模型可在消费级 GPU（24GB）微调
- DoRA：将权重分解为量级和方向分别训练，效果更接近全量微调

**考察点**：

1. LoRA 的低秩分解原理
2. 推理时的 LoRA 合并（无额外开销）
3. QLoRA 相比 LoRA 的内存进一步节省

---

### Q: 模型量化有哪几种方式？INT8、INT4 量化的原理和代价是什么？

**答案**：

量化把模型权重从 FP16 压缩到 INT8 或 INT4，核心是建立浮点值到整数的映射关系（scale 和 zero_point）。INT8 量化基本无感知损失，推理速度快 1.3x 左右，是生产环境最常用的量化级别——vLLM 的 AWQ INT4 推理在 7B 模型上可以用单张 RTX 4090 跑，成本大幅降低。对于本地运行，GGUF 格式（llama.cpp）支持在 CPU 上推理量化模型，让没有 GPU 的开发机也能跑 7B 模型。代价是精度有损，特别是对逻辑推理、数学、代码这类需要精确计算的任务影响更大，而对通用对话、文本总结影响较小。工程选择：追求最低成本且任务较简单用 INT4/AWQ；追求精度保证用 INT8；需要在 CPU 运行用 GGUF Q4_K_M 格式（K-means 量化，精度比简单线性量化好）。

**考察点**：

1. PTQ vs QAT 的选择（PTQ 快但精度低，QAT 慢但精度高）
2. GGUF 格式在本地部署的意义
3. 量化对长尾任务（代码/数学）的影响更大

---

### Q: 什么是 Fine-tuning 数据集的构建原则？如何避免灾难性遗忘？

**答案**：

微调数据的核心原则是"少而精"：500 条高质量人工标注数据往往比 5000 条 GPT-4 生成的样本更有效。格式一致性非常重要——如果训练时用 system/human/assistant 格式，推理时也必须保持，否则模型会困惑。防止灾难性遗忘的最实用手段是数据混合：在领域数据里掺 20% 的通用对话数据，让模型不会"忘记"基础能力。学习率和 epoch 数要保守，我通常用 cosine 调度，峰值 lr=2e-4，3 个 epoch，在验证集上监控通用能力指标。LoRA 本身由于只改变少量参数，天然就有一定的抗遗忘性。评估时要同时跑目标任务和通用 benchmark（MMLU/HumanEval），确保微调增益不以基础能力退化为代价。

**考察点**：

1. Self-instruct 的数据生成流程
2. 灾难性遗忘的本质原因（权重被覆写）
3. 数据量与效果的关系（边际收益递减）

---

### Q: LLM 的 Context Window 是如何扩展的？长上下文的技术挑战是什么？

**答案**：

上下文长度的核心限制来自位置编码和 KV Cache 显存。RoPE 通过旋转矩阵编码相对位置，相比绝对位置编码更容易泛化到更长序列；通过调整 RoPE 的旋转频率 base，可以将 4K context 的模型扩展到 32K 甚至更长，配合少量长文本微调效果很好。FlashAttention 解决的是计算效率：标准 Attention 会产生 N×N 的中间矩阵，128K 序列需要 64GB 就放不下，FlashAttention 用分块计算（tiling）把中间结果保留在更快的 SRAM 里，显存占用降到线性，速度快 2-4 倍。即使有了 200K 上下文，Lost in the Middle 仍然是实际问题——信息在文档中间时模型召回率显著低于开头和结尾，所以 RAG 做多文档上下文注入时，最重要的文档应该放在 context 开头或结尾。KV Cache 是另一个瓶颈，128K token 的 KV Cache 在 70B 模型上需要约 10GB 显存，限制了并发能力。

**考察点**：

1. RoPE 相比绝对位置编码的优势
2. FlashAttention 的内存优化原理（分块计算避免显存 O(N²)）
3. Lost in the Middle 现象对 RAG 设计的影响

---

### Q: 如何评估一个 LLM 的能力？常用的 Benchmark 有哪些？

**答案**：

选模型不能只看 MMLU，要根据实际任务选 benchmark。代码生成看 HumanEval pass@1，数学推理看 GSM8K，Agent 能力看 GAIA 或 SWE-bench。但标准 benchmark 和真实业务场景往往有分布偏差，我的做法是：先用标准 benchmark 做初筛，缩小候选模型范围，再在自建的业务数据集上精细评估——把真实用户问题抽样，用 LLM-as-Judge 对各候选模型输出打分，最后对 Top 2-3 个模型做人工盲测（不知道哪个模型输出哪个答案）。Benchmark 污染是个真实问题，新 benchmark 发布 6 个月后就会被训练数据收录，排名迅速飙升但不代表真实提升。我们内部维护一批从未公开的测试用例，专门用于不受污染的内部评测。

**考察点**：

1. 不同 benchmark 侧重不同能力（知识/推理/代码/Agent）
2. 自定义业务评测集的重要性
3. Benchmark 污染问题的识别

---

### Q: Embedding 模型的选择标准是什么？如何针对中文优化？

**答案**：

选 Embedding 模型要先明确场景：纯中文用 BGE-large-zh-v1.5（MTEB 中文检索榜单长期前列）；中英混合或多语言用 bge-m3（支持 100+ 语言，还能同时输出 BM25 风格的稀疏向量，一个模型实现混合检索）；成本敏感且无法本地部署用 OpenAI text-embedding-3-small（768 维，效果不错，价格低廉）。中文 Embedding 的一个坑是 512 token 限制，很多文档段落超过 512 个 token 时需要截断，可能丢失重要信息，选模型时要看 max_sequence_length。对于业务领域专词很多的场景（金融/医疗/法律），用业务语料微调 embedding 能显著提升检索召回率——构建查询-文档正样本对（人工或用 LLM 生成），加上难负例挖掘，在 sentence-transformers 框架上微调 1-3 个 epoch，检索 Recall@5 通常能提升 10-20%。

**考察点**：

1. MTEB 榜单的各 task 含义
2. 长文本 embedding 的截断策略
3. 稀疏 + 密集的混合检索（bge-m3）

---

### Q: 什么是 Reranker？Cross-Encoder 和 Bi-Encoder 有什么区别？

**答案**：

Bi-Encoder 和 Cross-Encoder 是互补的：Bi-Encoder 将 query 和 document 独立编码，document 向量可以预计算，检索时只需一次 query 编码加向量搜索，毫秒级完成；缺点是 query 和 document 没有深度交互，对模糊语义的召回率有限。Cross-Encoder 把 query+document 拼接后一起过模型，每层都有全注意力交互，打分精度高很多，但每个 pair 都要单独推理，Top-50 候选就要跑 50 次推理，速度是瓶颈。两阶段管道把二者结合：Bi-Encoder 快速召回，Cross-Encoder 精排，是当前 RAG 系统的标准架构。Reranker 对多义词和语义相近但意图不同的查询效果提升最显著——比如"苹果公司" vs "苹果水果"，Bi-Encoder 可能混淆，但 Cross-Encoder 能结合完整上下文精准判断。

**考察点**：

1. 为什么不直接用 Cross-Encoder 做召回（计算量 O(N×M)，N=query, M=文档数）
2. Reranker 对哪类查询提升最大（语义模糊、多意图查询）
3. 如何评估 Reranker 的效果（NDCG、MRR）

---

### Q: 什么是 GraphRAG？它解决了传统向量 RAG 的什么问题？

**答案**：

传统向量 RAG 把文档切成 chunk 做向量检索，擅长找"语义相似的局部片段"，但对"这批文档的整体主题是什么"、"文档 A 和文档 B 里的人物有什么关联"这类全局或关系型问题完全无力。GraphRAG 在索引阶段用 LLM 从文档里抽取实体和关系（"张三 CEO 了 A 公司"），构建知识图谱，再用社区发现算法把相关实体聚合，为每个社区生成摘要。查询时，全局问题（"这些文档的主要趋势是什么？"）聚合所有社区摘要回答，局部问题仍用向量检索。代价是索引构建非常贵——一份 100 页 PDF 需要几百次 LLM 调用抽取实体，适合知识库较稳定、对理解深度要求高的场景（企业知识图谱、科研文献分析）。对于普通 Q&A 场景，传统 RAG + Reranker 成本效益更高。

**考察点**：

1. GraphRAG vs 传统 RAG 的适用场景对比
2. 社区摘要的生成机制
3. LightRAG 等简化版本

---

### Q: 如何在生产环境部署 LLM Agent 服务？关键的工程考量有哪些？

**答案**：

生产部署 LLM Agent 要分三层考虑。模型服务层用 vLLM 部署开源模型（PagedAttention 让 KV Cache 碎片化使用，吞吐量比 naive serving 高很多），API 模型用 LiteLLM 做统一代理，一套代码切换 Claude/GPT/Gemini，并实现负载均衡和 failover。Agent 服务层设计为无状态，会话状态存 Redis（key: thread_id, value: 序列化 state），这样服务可以水平扩展，任意实例都能处理任意 session。流式输出通过 SSE 转发，后端用异步框架（FastAPI + asyncio）同时服务多个 stream。超时是个关键细节：LLM 有时会很慢，需要给用户端设置合理超时（如 60s），并在超时时返回友好提示而非直接断连。监控上，每次 LLM 调用都打 trace 到 Langfuse（自托管，数据不出境），日报中看 P95 延迟和 token 消耗趋势，发现异常及时告警。

**考察点**：

1. vLLM PagedAttention 的高吞吐原理
2. 无状态 Agent 设计的水平扩展优势
3. 多模型路由策略

---

### Q: 什么是 Agent 的"工具选择问题"？如何设计 Tool Registry 让 Agent 准确选择工具？

**答案**：

当 Agent 有十几个甚至几十个工具时，把所有工具描述塞进一个上下文是低效且不准确的。我的解决方案是两层架构：工具描述先做 Embedding，存入向量库；每次 Agent 请求时，先用用户意图（query）检索 Top-5 最相关的工具，只把这 5 个工具的 schema 放进 LLM context，大幅减少选择干扰。工具描述本身要精心设计：名称用动词+名词（`get_order_status`），描述里第一句说"用于查询特定订单的实时状态"，第二句说"不要用此工具搜索产品信息"，把工具的边界说清楚。参数描述要带示例和约束（`order_id: 订单号，格式为'ORD-XXXXXX'，如 'ORD-123456'`）。工具调用失败时实现 self-correction：把错误信息（如 Pydantic 校验失败）作为 tool_result 返回给 LLM，LLM 通常能自行修正参数重试。我在 Peppr 系统里实现了这套机制，工具选择准确率从 72% 提升到 93%。

**考察点**：

1. 工具数量超过一定量时的检索 + 分发策略
2. Self-correction 的实现（把工具调用错误返回 LLM 让其修正）
3. 工具描述的最佳实践

---

### Q: Pipecat / LiveKit Agents 等实时语音 Agent 框架的核心架构是什么？

**答案**：

实时语音 Agent 的核心挑战是延迟：用户停止说话到 AI 开始回话要 < 1秒才有自然对话感。Pipecat 用 asyncio pipeline 把 VAD → STT → LLM → TTS 串成异步管道，每个阶段产生数据就立即送下游而不等全部完成。关键优化是 LLM 流式输出到 TTS 流式输入：LLM 生成完第一个句子（检测到句号/逗号）就立刻送给 TTS 开始合成，TTS 合成完第一段就开始播放，同时 LLM 继续生成后续文本——三段流水线高度重叠。打断处理是另一个难点：检测到用户开口（VAD 触发）时，立即 cancel 当前 TTS 播放和 LLM 生成，清空 pipeline，以用户最新输入重新开始，这个打断逻辑在 Pipecat 里通过 Frame 类型（CancelFrame）控制各 Processor 的取消。在 Peppr 系统里我实现了 ConfidenceDetector Processor，当 SenseBot 判断用户意图不清晰时（low_confidence）插入澄清请求，而不是直接传给 LLM，减少了无效调用。

**考察点**：

1. 语音管道的三段延迟（STT latency + LLM TTFT + TTS latency）
2. 打断处理的实现（检测到用户说话，cancel 当前 TTS 和 LLM）
3. Turn-taking 的状态机设计

---

### Q: 什么是 LLM 红队测试（Red Teaming）？有哪些常见的攻击向量？

**答案**：

LLM 红队测试是在 AI 应用上线前主动寻找安全漏洞的过程，类似于传统软件的渗透测试但针对 LLM 特性。攻击向量分几类：越狱尝试绕过模型的安全对齐（角色扮演、编码混淆、渐进引导），提示词注入利用用户输入覆盖系统指令（直接注入容易防，间接注入难——Agent 读取的网页/文件里包含指令），信息泄露尝试提取 system prompt 或其他用户数据。防御要分层：在模型层用支持 Instruction Hierarchy 的模型（system prompt 权限最高，用户无法覆盖）；在应用层把用户输入放在明确的 XML 标签里与系统指令区分；对读取的外部内容在 prompt 里明确声明"以下是不可信内容"；在输出层检测是否包含系统指令内容（防泄露）。没有完美防御，定期运行自动化红队测试（Garak/PromptBench 等框架），对新发现的越狱模式及时更新防御。

**考察点**：

1. 间接注入的危险性（比直接注入更难防）
2. 多层防御的重要性（没有单一银弹）
3. System Prompt 保密的最佳实践

---

### Q: 如何实现 LLM 应用的内容安全过滤（Content Moderation）？

**答案**：

内容安全过滤是多层次的。输入层：先用快速规则过滤明显违规词（微秒级），再用 Moderation API（如 OpenAI 的 moderation endpoint 或自部署的 Llama Guard）做语义分类，识别 hate speech / violence / sexual content 等类别，置信度高的直接拦截，低置信度的标记人工复查。输出层：流式输出时每完成一个完整句子做一次检测，不等全部完成（避免流式体验变差）；检测到违规时立即截断并返回友好提示。PII 检测是另一个维度，用 presidio（Microsoft 开源）或规则匹配检测身份证/手机号/银行卡号等，在日志记录前脱敏。上下文相关性是难点——"如何制作炸药"的回答在正常化学课语境下是合法的，在恶意用户语境下不是；Llama Guard 做了上下文感知分类，比简单关键词好很多。假阳性的权衡：面向 C 端用户宁可多拦，面向企业内部工具可以放宽阈值，结合投诉量和业务需求动态调整。

**考察点**：

1. 输入过滤 vs 输出过滤的时机选择
2. Llama Guard 的分类机制
3. PII 检测和数据合规

---

### Q: 多模态 LLM 是如何处理图片的？Vision-Language 模型的架构是什么？

**答案**：

多模态 LLM 的标准架构是 Vision Encoder + Projection + LLM Decoder：图片先通过预训练的 ViT（如 CLIP 的 ViT-L）提取视觉特征，得到一组 image patch embedding，再通过一个 MLP 投影层将维度对齐到 LLM 的 embedding 维度，最后这些 image token 和文本 token 拼接在一起送入 LLM Decoder。一张图片通常产生几百个 image token（Claude 3 根据图片大小可达 1000+ token），显著消耗上下文窗口，成本要考虑。Image Tiling 是处理高分辨率图片的技巧：把图片切成多个 tile 分别编码再聚合，保留文字等细节（低分辨率 resize 后 OCR 会失败）。实际 Agent 设计里，多模态能力主要用于三类场景：文档图片 OCR（菜单、表格、截图解析）、界面操作（截图 → Agent 判断下一步操作）、视觉内容审核。在 Peppr 点餐系统里，菜品图片通过多模态识别辅助确认用户描述的菜品。

**考察点**：

1. Vision Encoder 的作用（把像素转为 LLM 能理解的 embedding）
2. Image Token 对上下文窗口的消耗
3. 实际应用中多模态 Agent 的设计模式

---

### Q: CrewAI 和 AutoGen 的核心设计理念是什么？它们与 LangGraph 有何不同？

**答案**：

三个框架的核心抽象不同：LangGraph 用状态图，你显式定义每个节点的处理逻辑和边的转移条件，像写状态机一样控制 Agent 的每一步，可观测性和可控性最强，适合需要上生产的复杂场景；CrewAI 用角色驱动，你定义每个 Agent 的职责（Role/Goal/Backstory），框架自动管理任务流转，类比"组建一个团队完成项目"，业务语义直观，开发快但自定义能力有限；AutoGen 用消息驱动，Agent 互相发消息对话，GroupChat 决定谁该发言，非常灵活但执行路径难以精确预测，更适合研究场景。我在工作中，原型阶段用 CrewAI 快速验证多 Agent 协作思路，确认可行后用 LangGraph 重写成生产版本，获得完整的 Checkpointing、HITL 和 Tracing 支持。

**考察点**：

1. 三种框架的核心抽象（图/角色/对话）
2. Hierarchical Agent 的任务分配机制
3. 框架选型的实际考量（可调试 vs 快速开发）

---

### Q: 什么是 Dify？它与 LangChain/LangGraph 的定位有什么不同？

**答案**：

Dify 是 LLMOps 平台，而 LangChain 是开发框架——这是最根本的区别。Dify 给你一个 Web UI，在里面可视化地拖拽节点（LLM节点、检索节点、代码节点）组成 Workflow，配置提示词、接入知识库，非技术的产品同学也能改 prompt 和流程，降低了协作成本。LangChain/LangGraph 是纯代码框架，灵活性更高，可以做任何自定义逻辑，适合复杂 Agent 的精细控制。工程上两者可以配合：用 Dify 快速验证 prompt 策略和 RAG 效果（它的 Debug 界面很方便看每一步的输入输出），确认后如果需要更复杂的逻辑再用 LangGraph 实现。Dify 的 RAG 内置了向量化、分块、检索、Rerank，对于标准 Q&A 场景够用，但高度定制化的 RAG（自定义分块策略、多步检索）还是需要自建。我们团队的实践是内部知识库问答用 Dify（业务同学可以自己维护文档和测试效果），对外的复杂 AI 产品用 LangGraph 自建。

**考察点**：

1. LLMOps 的概念（像 MLOps 一样管理 LLM 应用的全生命周期）
2. Dify 的 RAG 能力与自建 RAG 的对比
3. 选择平台 vs 自研的权衡

---

### Q: LlamaIndex 与 LangChain 的 RAG 能力有什么区别？

**答案**：

LlamaIndex 是 RAG 专家，在数据摄取（支持 PDF/HTML/数据库/Notion 等几十种数据源）和检索策略（Recursive Retrieval、SubQuestion 分解复杂问题）上比 LangChain 成熟。LangChain 更全面，RAG 能力不差但不是其核心专长，而 Agent 框架、工具集成、LangGraph 是其优势。实践中我会根据项目特点选择：知识库类项目（企业文档、代码库搜索）用 LlamaIndex，它的 RouterQueryEngine 可以根据问题类型路由到不同索引（结构化数据走 SQL 引擎，非结构化走向量检索）；需要复杂 Agent 逻辑的项目用 LangGraph；两者也可以配合，LlamaIndex 负责文档索引和检索，结果传给 LangChain Agent 处理。

---
