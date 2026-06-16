# RESTful API & FastAPI — 面试弹药库

> Q&A 对形式，覆盖 HR/技术面高频问题。追问点已预埋。

---

# 一、RESTful API 基础概念

## 1.1 什么是 RESTful API？一句话说清楚

**Q: 什么是 RESTful API？跟普通 API 有什么区别？**

REST 是一套**用 HTTP 协议的本意来设计接口**的架构风格，不是你发明新的协议，而是把 HTTP 动词（GET/POST/PUT/DELETE）和 URL 路径对应到资源的操作上。

跟"普通 API"的区别：很多项目把所有操作都走 `POST /api/doSomething`，动词藏在 body 里，URL 看不出操作什么资源。RESTful 的做法是 `GET /users/123` 一看就知道是拿用户 123 的数据。

核心不是规矩多，是**自解释**——新人看 URL 和 HTTP 方法就知道接口干什么。

**追问点**：如果面试官问"REST 是协议吗？"→ 不是，是**架构风格**。Roy Fielding 2000 年博士论文提出的。HTTP 是协议，REST 是教你怎么用好 HTTP。

---

## 1.2 资源（Resource）是什么？

**Q: REST 里说的"资源"到底指什么？**

一切可以用 URL 命名的东西都是资源。用户是资源（`/users`），某条订单是资源（`/orders/456`），甚至"用户 123 的头像"也是资源（`/users/123/avatar`）。

资源 ≠ 数据库表。资源是**对外的抽象**——`/user-profile` 背后可能 JOIN 了三张表，但调用方不关心，调用方只看到一个叫 user-profile 的资源。

关键特征：每个资源有**唯一 URL**（Uniform Resource Identifier），通过 URL 就能定位到它。

---

## 1.3 HTTP 动词的语义

**Q: GET/POST/PUT/PATCH/DELETE 各什么意思？什么时候用哪个？**

| 动词 | 语义 | 幂等？ | 举例 |
|------|------|--------|------|
| GET | 读取资源 | ✅ | `GET /users/123` 获取用户 |
| POST | 创建资源 | ❌ | `POST /users` 新建用户（两次请求＝两个用户） |
| PUT | 全量替换 | ✅ | `PUT /users/123` 整体替换用户数据 |
| PATCH | 部分更新 | ❌ | `PATCH /users/123` 只改手机号 |
| DELETE | 删除资源 | ✅ | `DELETE /users/123` 删除用户 |

**追问点：PUT 和 PATCH 的区别？**

PUT 是"把整个资源换成我给的这份新数据"，你没传的字段可能被清空。PATCH 是"只改我传的这几个字段"。实际项目中 PATCH 更常用——没人会为了改个手机号把整个用户对象传一遍。

**追问点：POST 和 PUT 都能创建资源，怎么选？**

- 客户端决定 URL（如 `PUT /users/123`，客户端知道 ID=123）→ 用 PUT
- 服务端生成 URL（如 `POST /users`，服务端生成 ID 返回）→ 用 POST

---

## 1.4 幂等性（Idempotency）

**Q: 什么是幂等性？为什么重要？**

幂等 = 同一个请求执行 1 次和执行 N 次，副作用相同。

不是"返回结果相同"（GET 两次，中间数据变了结果当然不同），是**副作用**相同：DELETE 第一次删了，第二次返回 404——没多删东西，是幂等的。POST 两次创建了两个用户——不是幂等的。

**为什么重要**：网络不可靠。前端超时后用户必然重试。如果接口不幂等，重试=重复扣款/重复下单。解决方案：请求里带 `Idempotency-Key` 头，服务端按 key 去重。

---

## 1.5 RESTful URL 设计规范

**Q: URL 应该怎么设计？常见的坑？**

核心原则：
- **名词复数**：`/users` 而非 `/getUsers` 或 `/user`
- **层级表达关系**：`/users/123/orders`（用户 123 的订单）
- **用 Query String 做过滤**：`/users?status=active&page=2`
- **不用动词**：`/getUserById?id=123` ❌ → `GET /users/123` ✅

常见坑：
- URL 里暴露内部实现（`/getUserFromMySQL?id=123`）
- 层级过深（`/users/123/orders/456/items/789/payments`——超过 3 层说明可能需要拆资源）
- 用 POST 做查询（`POST /users/query` 传 body 做过滤）

**追问点：搜索操作用什么动词？**

搜索本质是读操作，用 `GET /users?q=张三`。如果查询条件太复杂放不进 query string，可以 `POST /users/search`——务实妥协，比硬套 GET + 2KB 的 query string 要好。

---

## 1.6 状态码的正确使用

**Q: HTTP 状态码你怎么用？**

不要所有情况都 200 + body 里的 `{"code": 0}`。用 HTTP 标准状态码：

| 状态码 | 含义 | 使用场景 |
|--------|------|---------|
| 200 | OK | GET/PUT/PATCH 成功 |
| 201 | Created | POST 创建资源成功，配合 `Location` 头 |
| 204 | No Content | DELETE 成功，无返回体 |
| 400 | Bad Request | 参数校验失败、请求格式错误 |
| 401 | Unauthorized | 未登录/Token 缺失 |
| 403 | Forbidden | 已登录但无权访问 |
| 404 | Not Found | 资源不存在 |
| 409 | Conflict | 版本冲突、重复创建 |
| 422 | Unprocessable Entity | 参数格式对但语义不对 |
| 429 | Too Many Requests | 触发限流 |
| 500 | Internal Server Error | 未预期的服务端错误 |

**追问点：400 和 422 怎么区分？**

400 = 请求本身有问题（JSON 格式不对、必填字段缺失）。422 = 请求格式对但业务逻辑上不合法（用户名已存在、金额超过限额）。实际中很多项目混用，但能区分是加分项。

---

## 1.7 版本管理

**Q: API 版本怎么管理？URL 里带版本号还是 Header 里带？**

三种主流方式：

| 方式 | 示例 | 优点 | 缺点 |
|------|------|------|------|
| URL Path | `/v1/users` | 一眼可见、调试友好 | URL 变长、"污染"资源路径 |
| Header | `Accept: application/vnd.api+json;version=1` | URL 干净 | 调试不便、文档需强调 |
| Query String | `/users?version=1` | 简单 | 容易遗漏、语义不明确 |

**我倾向 URL Path**：浏览器和 curl 直接看到版本，不会出现"调了 v2 的接口用 v1 的 header"的排查灾难。代价是"技术信息在 URL 里"，但这个代价值。

---

## 1.8 RESTful 的局限性

**Q: RESTful 有什么缺点？什么时候不适用？**

- **多资源关联查询**：客户端需要用户+订单+商品，REST 可能要调 3 次。GraphQL 一次搞定
- **实时推送**：REST 是请求-响应，不适合服务端主动推送（需要 WebSocket/SSE）
- **动作类操作**：`POST /orders/123/cancel` 这样的"伪资源"在 REST 里不自然——取消是动作不是资源，但大家都在用、接受就好
- **过度嵌套**：`/users/123/orders/456/items/789` 变成依赖链，下游服务改了影响上游

**要点**：REST 不是万能的，但它是最通用的。面试官想听你"知道优点也知道边界"，而非盲信。

---

# 二、FastAPI 核心特性

## 2.1 FastAPI 是什么？为什么快？

**Q: FastAPI 为什么叫"Fast"？哪些地方快？**

三个层面的"快"：

1. **写代码快**：类型注解 + Pydantic 自动校验 + 自动生成 OpenAPI 文档，声明式开发
2. **运行快**：Starlette（ASGI 异步框架）+ Uvicorn（uvloop），NodeJS/Go 级别的吞吐
3. **迭代快**：自动生成的 Swagger UI / ReDoc，前后端联调不用另写接口文档

底层：Starlette 处理 HTTP 和 WebSocket，Pydantic 做数据校验和序列化。FastAPI 是两者之上的胶水层。

---

## 2.2 ASGI 和 WSGI 的区别

**Q: FastAPI 用的 ASGI 跟 Flask/Django 用的 WSGI 有什么不同？**

| | WSGI | ASGI |
|---|------|------|
| 模型 | 同步，一个请求一个线程 | 异步，事件循环 |
| 协议 | 只支持 HTTP | HTTP + WebSocket + HTTP/2 |
| 并发 | 靠多线程/多进程 | 协程，单线程高并发 |
| 代表 | Flask, Django | FastAPI, Starlette, Django 3+ |

WSGI 诞生于 2003 年，那时没有 async/await。ASGI 是为异步设计的。

**追问点：WSGI 应用能不能用 async？**

不能直接。Flask 的视图函数改 `async def` 会报错或者行为不可预测。Flask 2.0+ 有有限支持，但底层仍是 WSGI。这也是为什么 I/O 密集项目从 Flask 迁 FastAPI。

---

## 2.3 类型注解与自动校验

**Q: FastAPI 怎么用 Python 类型注解做校验？**

```python
from pydantic import BaseModel, Field
from fastapi import FastAPI

app = FastAPI()

class CreateUserRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    age: int = Field(..., ge=0, le=150)
    email: str

@app.post("/users")
async def create_user(req: CreateUserRequest):
    # 到这里 req 已经是校验通过的对象
    # 不用写 if not name: return 400
    return {"id": 1, "name": req.name}
```

**原理**：`req: CreateUserRequest` 的类型注解告诉 FastAPI 用 `CreateUserRequest` 校验请求体。校验失败自动返回 422 带详细错误信息。你写的函数体里**只处理成功路径**——这是 FastAPI 最大的开发体验提升。

**追问点：路径参数、Query String、Header 也能自动校验？**

都能。`async def get_user(user_id: int = Path(..., ge=1))`、`page: int = Query(1, ge=1)`、`x_token: str = Header(...)`——FastAPI 把所有参数源都统一到了类型注解体系。

---

## 2.4 路由函数 async def vs def

**Q: FastAPI 路由什么时候用 `async def` 什么时候用 `def`？**

| | `async def` | `def` |
|---|------------|-------|
| 执行线程 | 事件循环主线程 | 线程池（`run_in_threadpool`） |
| 适合 | I/O 等待（调数据库、调上游 API） | CPU 计算（数据处理） |
| 阻塞影响 | await 时让出，不阻塞其他请求 | 在线程池里，不阻塞事件循环 |

**经验规律**：如果你的函数体里有 `await`（如 `await db.fetch()`）→ `async def`。如果没有 `await` 且是 CPU 密集型 → `def`。

**追问点：`def` 函数里调 `time.sleep(5)` 会怎样？**

不会阻塞事件循环——FastAPI 把 `def` 函数丢给了 `run_in_threadpool`，sleep 在线程里执行。但如果 100 个并发都 sleep，线程池满了就排队等。所以**即使 `def`，也别在函数里长时间阻塞**。

---

## 2.5 自动生成 API 文档

**Q: FastAPI 的文档是怎么自动生成的？**

基于 **OpenAPI（原 Swagger）规范**。FastAPI 从路由函数签名里自动提取请求/响应 schema：

- `GET /docs` → Swagger UI（交互式，可在线调接口）
- `GET /redoc` → ReDoc（阅读友好，适合打印/导出）

你写 `req: CreateUserRequest`，文档就自动带上 `name`/`age`/`email` 三个字段及校验规则。**不写额外一行文档代码**。

**追问点：能自定义文档描述吗？**

`@app.post("/users", summary="创建用户", description="...", tags=["用户模块"])`。Pydantic 的 `Field(description="用户姓名")` 也会进文档。

---

## 2.6 依赖注入（Depends）

**Q: FastAPI 的 `Depends` 是做什么的？**

把可复用的逻辑提取出来，框架帮你**自动解析并注入**：

```python
from fastapi import Depends

async def get_current_user(token: str = Header(...)):
    # 从 token 解析用户
    return user

@app.get("/me")
async def me(user = Depends(get_current_user)):
    # 函数体只写业务逻辑
    return {"username": user.name}
```

**比装饰器好在哪里**：
- 装饰器隐式注入，IDE 追踪不到参数来源。`Depends` 是显式声明，类型推断正常工作
- 依赖有缓存（同一请求里多处 `Depends(get_db)` 只执行一次，共享缓存）
- 可以嵌套（`Depends(auth)` 又依赖 `Depends(get_db)`）

**追问点：说了这么多，跟 Flask 的 `@login_required` 装饰器有什么区别？**

装饰器里注入的参数对函数体不可见——`me()` 拿不到 user 对象，只能在装饰器里挂到 `g` 上再读。`Depends` 直接注入到函数签名，写法和测试都更清晰。

---

## 2.7 Pydantic 模型与响应序列化

**Q: 请求和响应的模型为什么要分开？Pydantic 怎么做到高效序列化？**

请求和响应是**不同的契约**：
- 请求 `UserCreateRequest`：有 name/email/password
- 响应 `UserResponse`：有 id/name/email，**没有 password**
- 传给数据库的 `UserInDB`：有 id/name/email/hashed_password

如果共用一个模型，要么 password 字段混进响应，要么用 `exclude` 到处打补丁。

Pydantic v2 的序列化引擎用 Rust 重写（pydantic-core），比 v1 快 5-50 倍。`response_model=UserResponse` 声明后 FastAPI 自动过滤掉模型之外的字段——你不用手动 `dict()` + pop()。

---

## 2.8 中间件（Middleware）与 CORS

**Q: FastAPI 中间件怎么用？和 `Depends` 有什么区别？**

中间件是**全局的、对所有路由生效的** AOP 切面：

```python
@app.middleware("http")
async def add_process_time_header(request, call_next):
    start = time.time()
    response = await call_next(request)
    response.headers["X-Process-Time"] = str(time.time() - start)
    return response
```

CORS 中间件直接一行：`app.add_middleware(CORSMiddleware, allow_origins=["*"])`。

**和 `Depends` 的分工**：
- 中间件：HTTP 协议层（Header 修改、CORS、日志、限流计数器）
- `Depends`：业务逻辑层（权限校验、数据库连接、用户身份解析）

---

## 2.9 后台任务与 Celery

**Q: FastAPI 的 `BackgroundTasks` 和 Celery 各用于什么场景？**

| | BackgroundTasks | Celery |
|---|----------------|--------|
| 执行位置 | 同一进程 | 独立 Worker 进程 |
| 适用耗时 | 毫秒-秒级 | 秒-小时级 |
| 持久化 | ❌ 重启丢失 | ✅ 消息队列持久化 |
| 重试机制 | ❌ | ✅ |
| 配置复杂度 | 零 | 需要 Broker + Backend |

**经验规律**：发邮件、写审计日志 → `BackgroundTasks`。OCR 识别、异步训练 → Celery。它们不是互斥的——项目中 `BackgroundTasks` 里可以再触发 Celery 任务。

---

# 三、FastAPI vs 其他框架

## 3.1 FastAPI vs Flask

**Q: 为什么选 FastAPI 而不是 Flask？**

| | FastAPI | Flask |
|---|---------|-------|
| 异步支持 | 原生 async/await | WSGI 本质同步（2.0+ 有限支持） |
| 数据校验 | 类型注解自动校验 | 手写或 Flask-Marshmallow |
| API 文档 | 自动生成 Swagger | 需插件（flasgger/apispec） |
| WebSocket | 原生支持 | 需 flask-socketio |
| 性能 | Starlette 异步，吞吐高 | 同步，多线程撑高并发 |
| 生态成熟度 | 较新，2019- | 2010-，海量教程和插件 |

**但也要诚实**：Flask 的生态比 FastAPI 大十年，一些特殊场景（如 Flask-Admin 做管理后台）FastAPI 没有同等简洁的方案。

---

## 3.2 FastAPI vs Django / Django REST Framework

**Q: FastAPI 和 Django REST Framework（DRF）怎么选？**

| | FastAPI | Django + DRF |
|---|---------|--------------|
| 开发速度 | 极快（声明式） | 快（ModelSerializer 省事） |
| 灵活性 | 高，无约束 | 遵循 Django 惯例 |
| 异步支持 | 原生 | 3.1+ 支持但仍有限 |
| ORM | 不绑定，SQLAlchemy/Tortoise/Mongo | Django ORM |
| 内置模块 | 少（靠自己组合） | 多（admin/auth/sessions/migrations） |
| 适合场景 | 微服务、API 网关、AI 推理服务 | 全栈应用、后台管理系统 |

**一句话总结**：如果你需要 Admin 后台 + ORM + 用户系统一站式——Django。如果你需要高性能 API + 异步 + 自选组件——FastAPI。

---

## 3.3 FastAPI vs Go/Gin、Node.js/Express

**Q: Python 的 FastAPI 和 Go 的 Gin、Node 的 Express 比，性能够用吗？**

FastAPI 的瓶颈几乎从不在框架层——Uvicorn + uvloop 的底层是 C 写的，Starlette 的路由匹配是编译成字典查找。真正的瓶颈是**数据库查询、上游 API 调用**，这些与语言和框架无关。

Go 的 CPU 密集型快，但 I/O 密集型场景 FastAPI 的异步模型完全能打。TL;DR：**对 99% 的业务 API，FastAPI 的性能不是短板，数据库设计才是。**

---

# 四、实战场景追问

## 4.1 文件上传怎么处理？

**Q: FastAPI 怎么处理大文件上传？**

```python
from fastapi import UploadFile, File

@app.post("/upload")
async def upload(file: UploadFile = File(...)):
    # UploadFile 自带 spool（小于内存阈值存内存、大于写入临时文件）
    content = await file.read()
    # 或流式写
    with open(f"./uploads/{file.filename}", "wb") as f:
        while chunk := await file.read(1024 * 1024):  # 1MB chunks
            f.write(chunk)
    return {"filename": file.filename}
```

关键点：`UploadFile` 的 `.read()` 是 async 的，不阻塞事件循环。size 超限应在 **Middleware 层检查 Content-Length**，不用读完整个文件再拒绝。

---

## 4.2 接口限流怎么做？

**Q: FastAPI 怎么做 API 限流？**

方案一：用 `slowapi`（基于 Flask-Limiter 移植）

```python
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

@app.get("/users")
@limiter.limit("100/minute")
async def get_users(request: Request):
    ...
```

方案二（自研）：redis INCR + TTL，固定窗口。更灵活但需要自己写 middleware。

---

## 4.3 全局异常处理

**Q: FastAPI 怎么统一处理异常，不写 try/except 遍地？**

```python
from fastapi import Request
from fastapi.responses import JSONResponse

@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError):
    return JSONResponse(status_code=400, content={"detail": str(exc)})

# 兜底异常
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled: {exc}", exc_info=True)
    return JSONResponse(status_code=500, content={"detail": "内部错误"})
```

路由函数里放心 `raise ValueError("用户名已存在")`，handler 自动转成 400 响应。不用每个路由里 try/except。

---

## 4.4 数据库怎么选？SQLAlchemy 还是其他？

**Q: FastAPI 生态里用什么 ORM？**

- **SQLAlchemy 2.0+**（推荐）：支持 async（`asyncpg` 驱动），成熟稳定，社区最大
- **Tortoise ORM**：专为异步设计，Django 风格 API，轻量但不成熟
- **MongoDB**：官方 `motor` 驱动，原生支持 async

FastAPI 官方示例用的 SQLAlchemy。实践里：

```python
# 用 Depends 注入 session
async def get_db():
    async with AsyncSessionLocal() as session:
        yield session

@app.get("/users/{user_id}")
async def get_user(user_id: int, db = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()
```

---

## 4.5 测试怎么写？

**Q: FastAPI 怎么测试接口？**

用 `TestClient`（基于 HTTPX/Requests）：

```python
from fastapi.testclient import TestClient

client = TestClient(app)

def test_create_user():
    response = client.post("/users", json={"name": "张三", "age": 25})
    assert response.status_code == 201
    assert response.json()["name"] == "张三"
```

依赖注入可以覆盖：`app.dependency_overrides[get_db] = get_test_db`，测试里用 SQLite 替代 PostgreSQL。

---

## 4.6 部署与生产

**Q: FastAPI 怎么部署到生产环境？**

标准配置：`Uvicorn` 或 `Gunicorn + Uvicorn workers`

```bash
# 开发环境
uvicorn main:app --reload

# 生产环境（Gunicorn 管理进程 + Uvicorn 做异步）
gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
```

Worker 数通常设 `CPU 核数 × 2 + 1`。Docker 化很自然——官方镜像是 `tiangolo/uvicorn-gunicorn-fastapi`。

---

# 五、RESTful API 常见面试追问

## 5.1 认证方式：JWT vs Session？

**Q: API 认证用 JWT 还是 Session？为什么？**

| | JWT | Session |
|---|-----|---------|
| 状态存储 | 客户端（Token 自带信息） | 服务端（内存/Redis） |
| 可扩展性 | 天然无状态，水平扩展友好 | 需要共享 Session Store |
| 吊销 | 难（需黑名单） | 容易（删 session 即可） |
| 适用场景 | 分布式微服务、移动端 | 单体应用、传统 Web |

**实际项目倾向**：微服务架构用 JWT（无状态，不用查 session），再配合短有效期 + refresh token 解决吊销问题。

---

## 5.2 HATEOAS 是什么？实际用过吗？

**Q: REST 成熟度模型里 HATEOAS 是什么？**

Hypermedia As The Engine Of Application State——响应里带超链接告诉客户端"你接下来可以干什么"：

```json
{
  "id": 123,
  "name": "张三",
  "_links": {
    "self": "/users/123",
    "orders": "/users/123/orders",
    "deactivate": "/users/123/deactivate"
  }
}
```

**诚实说**：Level 3 理论上是最 RESTful 的，但实际项目中很少用到。支付宝/微信支付的回调通知都没用 HATEOAS。面试官会欣赏你"知道这个概念但不盲从"。

---

## 5.3 分页怎么做？

**Q: API 分页有哪几种方式？**

| 方式 | 适用场景 | SQL | 缺点 |
|------|---------|-----|------|
| Offset-based | 传统后端、固定页数 | `LIMIT 20 OFFSET 40` | offset 大时性能差（MySQL 要扫过前面所有行） |
| Cursor-based | 无限滚动、实时数据流 | `WHERE id > ? LIMIT 20` | 不能跳页、不是所有字段有天然游标 |

**推荐**：列表页用 offset（用户要跳页），时间线用 cursor（实时追加，不需要跳页）。

---

## 5.4 N+1 问题是什么？

**Q: API 开发里 N+1 问题是什么？怎么解决？**

查询 100 个用户，每个用户再查一次订单（100+1=101 次查询）。解决：批量查询 + 内存组装。

```python
# ❌ N+1
users = await db.fetch_all("SELECT id, name FROM users")
for user in users:
    user["orders"] = await db.fetch_all("SELECT * FROM orders WHERE user_id=?", user["id"])

# ✅ 2 次查询
users = await db.fetch_all("SELECT id, name FROM users")
user_ids = [u["id"] for u in users]
orders = await db.fetch_all("SELECT * FROM orders WHERE user_id IN ?", user_ids)
# 内存里 group by user_id
```

FastAPI 生态里 GraphQL（Strawberry）的 DataLoader 可以自动批处理解决 N+1。

---

## 5.5 如何保证 API 的向后兼容？

**Q: API 升级怎么不破坏老客户端？**

- **只加不减**：加新字段可以，删老字段或改类型不行（除非做版本号）
- **字段默认值**：新字段设默认值，老客户端不传也能跑
- **响应不删字段**：老客户端可能解析到未知字段——Pydantic 默认忽略，不影响
- **废弃字段走流程**：标注 `@deprecated` → 文档说明 → 发邮件通知调用方 → N 个版本后再删
- **版本号是最后手段**：`/v2/` 可以彻底重写，但维护两套 API 成本高

---

# 六、高频"陷阱"问题

## 6.1 "RESTful 真的无状态吗？"

无状态 = **每个请求包含处理所需全部信息，服务端不存会话上下文**。但无状态 ≠ 不认证——JWT Token 在请求头里带着，请求本身是自包含的，所以是无状态的。

如果服务端存了"用户当前在第几步操作"——就是有状态，跨实例扩展时这个信息需要同步。

---

## 6.2 "POST 和 PUT 都能创建，我用 POST 就行了吧？"

技术上是可以的，但区分是为了**语义清晰**：
- 客户端如果已经知道资源 ID（比如 `PUT /upload-policies/{uuid}`），用 PUT 直接写进去
- 服务端生成 ID 的场景（`POST /users`），用 POST

另一个角度：PUT 幂等意味着重试安全——客户端超时后可以无脑重发。POST 不行。

---

## 6.3 "FastAPI 里所有函数都写 async def 就对了？"

不对。如果你的函数体里全是**同步调用**（如纯 CPU 计算、不是 I/O），写 `async def` 反而增加事件循环调度开销。`def` 会被自动丢进线程池，可能更快。

规则：有 `await` → `async def`；没有 `await` + 不是 I/O 密集 → 就用 `def`。

---

## 6.4 "FastAPI 能做 WebSocket，是不是就不用单独的推送服务了？"

FastAPI 原生支持 WebSocket，适合简单场景（如实时日志、状态通知）。但生产级的实时推送（如聊天、协同编辑）需要：
- 消息重连恢复
- 广度投递（广播到多个节点上的连接）
- 离线消息队列

这些 FastAPI 本身不提供——通常搭配 Redis Pub/Sub 或专门的推送中台。

---

## 自检清单（面试前 10 分钟快速过一遍）

- [ ] REST 不是协议，是架构风格
- [ ] 能说出幂等 GET/PUT/DELETE，非幂等 POST/PATCH
- [ ] 能解释 PUT vs PATCH
- [ ] 状态码能随手写出 200/201/204/400/401/403/404/409/422/429/500
- [ ] 知道 ASGI 和 WSGI 的核心区别：异步 vs 同步
- [ ] 能画出 FastAPI = Starlette + Pydantic + OpenAPI 的组件关系
- [ ] Depends 装饰器 vs 类型注入的区别说得清
- [ ] async def 路由 vs def 路由的线程模型
- [ ] Pydantic v2 的 Rust 引擎
- [ ] 能说出至少一个 FastAPI 的局限（如缺少内置 ORM、生态不如 Django 成熟）
