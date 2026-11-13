
## 插件（扩展程序）后端服务

### URL 健康监控

#### 防止搜索引擎收录

- 全站响应（包括 API、静态资源和 404）带有 `X-Robots-Tag: noindex, nofollow, noarchive, nosnippet, noimageindex`，首页同时设置 robots meta 标签。
- `/robots.txt` 返回 `User-agent: *` 和 `Disallow: /`，要求所有守规矩的爬虫不抓取本站；重启服务端后生效，无需修改插件。
- 这些设置仅用于防抓取和防收录，不是访问控制。网页和接口仍可公开访问，恶意爬虫可以忽略指令；不能因此将敏感数据视为受保护。
- 如果网址已经被收录，禁止抓取也可能阻止搜索引擎重新读取 `noindex`，仅添加这些配置无法保证立即移除历史搜索结果，需要通过相应搜索引擎的站长工具申请删除。

#### 运行与配置

- 使用现有 `npm start` / `npm run dev` 启动，监听成功后立即巡检，此后每 3 小时重新读取 `urls` 目录。一个进程内不会重叠巡检；生产环境请只运行一个监控实例，避免多个进程重复探测、同时写文件。
- `urls/data.json` 和 `urls/additional_data.json` 均使用 `{ "urls": [{ "name": "...", "host": "https://example.com", "category": "2026" }] }`。前者的 `type` 为 `normal`，后者为 `additional`。同一个规范化 URL 只检测一次，additional 覆盖 normal。
- `urls/ignore_urls.json` 使用 `{ "data": ["https://example.com"] }`，在合并后排除。匹配完整 URL，自动规范化域名大小写、默认端口和根路径斜杠、忽略锚点；不同路径或查询参数仍是不同 URL。
- 按顺序发送 GET 请求，后续请求（包含重试）在前一次结束后等待 2 秒。单次请求最多 15 秒，最多跟随 5 次重定向；最终响应非 2xx、网络错误、超时均算失败。失败后重试一次，两次都失败才标为 `error`。
- HTTP(S) 请求使用单个 options 对象，兼容旧式 `get(options, listener)` 参数约定，避免把请求头对象误当成回调函数。
- 每轮结束将结果原子写入 `urls/result.json`，重启可恢复上次结果；不修改三个配置文件。配置和结果写入错误会明确记录日志并显示监控异常。
- `GET /api/status` 返回当前有效 URL、逐项结果和汇总：`state`（`healthy` / `error` / `unknown`）、`hasErrors`、`errorCount`、`healthyCount`、`pendingCount`、`checking`、巡检时间等。配置或巡检系统异常返回 HTTP 503 和同样的 JSON 结构；URL 检测失败本身仍返回 HTTP 200。
- `GET /` 首页直接显示无需登录的状态页面，每 30 秒自动更新，可按名称、URL、分类、类型和状态筛选。不提供手动刷新状态按钮，也没有手动触发巡检的接口；读取状态不会触发额外巡检。原 `/status` 页面已移除，访问返回 404。配置变化会立即反映在列表中，新 URL 在下一次巡检前显示等待检测。
- 首次巡检未完成、存在待检测项、结果超过 6 小时未更新，或配置/监控异常时整体状态为 `unknown`，不会误报正常。部署时如不希望公开这些 URL，请在反向代理限制状态页面和接口的访问，并允许插件所在设备访问。
- 验证：`npm run test:health`，仅使用临时目录和本机 HTTP 服务，不访问实际监控域名。


### 后端基础框架
后端主要是使用开源的 `Parse Server`，此框架已经提供很友好的 **REST API**，所以只需要根据提供的功能进行接入即可。

Github 代码访问地址：[https://github.com/parse-community/parse-server](https://github.com/parse-community/parse-server)

技术文档请参考：[https://docs.parseplatform.org/](https://docs.parseplatform.org/)

**插件的前端请参考以下链接**

JS SDK: [https://docs.parseplatform.org/js/guide/](https://docs.parseplatform.org/js/guide/)

**插件后端请参考以下链接**

Parse Server: [https://docs.parseplatform.org/parse-server/guide/](https://docs.parseplatform.org/parse-server/guide/)

**云函数请参考**

Cloud Code: [https://docs.parseplatform.org/cloudcode/guide/](https://docs.parseplatform.org/cloudcode/guide/)

### 数据库
数据库选用了 Mongodb。*（目前的插件很少使用到高级的数据库功能，就是常规的增删改查，直接从 Parse 层面使用就足够了）*。
正式环境使用了官方的云数据库：[https://www.mongodb.com/cloud](https://www.mongodb.com/cloud)

### 后端使用 ngrok 进行穿透

ngrok 官网：[https://ngrok.com/](https://ngrok.com/)

*具体的使用你自己本地弄一个自己的文件就可以了。*

``` bash
cd /Users/shuhankuang/Desktop/working/ngrok
./ngrok http 3875
```


### 下面是后端的运行参数 config.json 配置

目前图片`图片上传功能、邮件发送功能`比较少用。
```json
{
  emailAdapter: ...
  filesAdapter: ...
}
```

参数配置文件 `config.json`、`config-dev.json` 生产环境与开发环境的配置，主要是区分数据库地址。

**注意：**
每次做新的插件，都对以下参数进行修改
```json
{
  databaseURI: ...
  appId: ...
  masterKey: ...
  serverURL: ...
  app: ...
}
```

因为每个插件有一个独立的后端，所以需要配对一个独立的 AppID，在文件 `src/ext.js` 里进行修改。

```javascript
APP.PARSE_KEY = 'huawvdrdlruoblt....rwlaznmzrsqmlvkjdu'
```

以下网址可以生成随机字符串（用于 appId, masterKey）

[http://www.unit-conversion.info/texttools/random-string-generator/](http://www.unit-conversion.info/texttools/random-string-generator/)

[https://onlinerandomtools.com/generate-random-string](https://onlinerandomtools.com/generate-random-string)

例子：**config-dev.json** 的参数，详细介绍[参考链接](https://github.com/parse-community/parse-server#configuration)。
```json
{
  "databaseURI": "mongodb://localhost:27017/Empty-Project-Server",
  "appId": "huawvdrdlruoblt....rwlaznmzrsqmlvkjdu",
  "masterKey": "udoumcycaxcqg.....vkwtduaveao",
  "serverURL": "http://localhost:3875/parse",
  "payServerURL": "http://localhost:3920/parse",
  "cloud": "./cloud/main.js",
  "verbose": 1,
  "production": true,
  "app": "Empty-Project",
  "verifyUserEmails": false,
  "emailAdapter": {
    "module": "parse-server-mailgun",
    "options": {
      "fromAddress": "Youtube Playlist Export <noreply@yourapp.com>",
      "domain": "support.extensionsbox.com",
      "apiKey": "key-98aqnzzy4....soo3r5",
      "templates": {
        "customEmailAlert": {
          "subject": "Urgent notification!",
          "pathPlainText": "./email-templates/custom_email.txt",
          "pathHtml": "./email-templates/custom_email.html"
        }
      }
    }
  },
  "filesAdapter": {
    "module": "@parse/s3-files-adapter",
    "options": {
      "bucket": "gsnippets",
      "region": "us-west-1",
      "bucketPrefix": "",
      "directAccess": true,
      "fileAcl": null,
      "baseUrl": null,
      "baseUrlDirect": false,
      "signatureVersion": "v4",
      "globalCacheControl": null,
      "ServerSideEncryption": "AES256",
      "validateFilename": null,
      "generateKey": null
    }
  }
}
```

### 后端服务启动

为了启动方便写了个简单的 bash 文件进行启动。

启动**开发环境**，
```bash
sh st.sh
```
启动**生产环境** （后面有参数 **1**）
```bash
sh st.sh 1
```

### 插件官网域名

一般域名都是采用二级域名，会根据插件的**名称**进行修改。

`文件: extension.extensionsbox.com.conf`，Nginx 的域名映射配置文件。

```
server {
    server_name extension.extensionsbox.com;
    location / {
      proxy_pass http://localhost:3875;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection 'upgrade';
      proxy_set_header Host $host;
      proxy_cache_bypass $http_upgrade;
    }
}
```


### Paddle 的付费订阅参数

因为插件部分插件使用了 Paddle 作为支付服务区商，所以会有参数配置。

Paddle 官网：[https://vendors.paddle.com/login](https://vendors.paddle.com/login)

```json
{
  "paddle": "shuhankuang@gmail.com",
  "vendor": 120140,
  "daily": 620492,
  "monthly": 633858,
  "quarterly": 633859,
  "yearly": 633860
}
```

### Stripe 的付费订阅配置

`stripe-dev.json` or `stripe.json` 开发环境与生产环境配置

```json
{
  "stripe": {
    "store": "WeBoosterStore",
    "pkey": "pk_test_mABhg....HorAzB",
    "skey": "sk_test_51FHJFEDXZ6EhFqzcqWb9......Gm2gDCYXeUCJ8uDrA6cQEs27HjbNielqx900p5XbBGz8",
    "successUrl": "https://545fd1a55931.ngrok.io/pay/complete",
    "cancelUrl": "https://545fd1a55931.ngrok.io/pay/cancel",
    "portalReturnUrl": "https://545fd1a55931.ngrok.io"
  },
  "upsell": {
    "text": "35% Off, <i class=\"fas fa-bolt\" style='color: white'></i>&nbsp;&nbsp;Limited time offer. Sale ends in",
    "only_show_text": false,
    "time": 86400
  },
  "subscriptions": [{
      "name": "monthly",
      "upsell_plan": "price_1JF8znDXZ6EhFqzcdCp1XUik",
      "upsell_price": "$6.99",
      "plan": "price_1JF8znDXZ6EhFqzclVCxG3sK",
      "price": "$9.99"
    },
    {
      "name": "quarterly",
      "upsell_plan": "price_1JF8znDXZ6EhFqzcUqz9MeKz",
      "upsell_price": "$24.99",
      "plan": "price_1JF8znDXZ6EhFqzcIOVqRJdZ",
      "price": "$29.99"
    },
    {
      "name": "yearly",
      "upsell_plan": "price_1JF8znDXZ6EhFqzc9R6UaDXA",
      "upsell_price": "$69.99",
      "plan": "price_1JF8znDXZ6EhFqzc01gToFWs",
      "price": "$89.99"
    }
  ]
}
```


### 促销（Upsell）时间设置
```javascript
// 可以通过设置无限长的时间进行长时间的降价
"upsell": {
  "text": "35% Off, <i class=\"fas fa-bolt\" style='color: white'></i>&nbsp;&nbsp;Limited time offer. Sale ends in",
  "only_show_text": false, // 文字显示
  "time": 86400 // 倒计时的时长 (如果设置为 -1, 那么就不提供优惠)
}
```

```javascript
"upsell": {
  "text": "35% Off, <i class=\"fas fa-bolt\" style='color: white'></i>&nbsp;&nbsp;Limited time offer.", // 只是显示文字
  "only_show_text": true, // 只是显示问题
  "time": 86400 // 如果不显示时长（秒），那么就可以把时间设置大一点
},
```

### 支付服务配置
`pay-confing.json`
```json
{
  "appId": "0742vWqaHDnW5Vkvb.....19XOPd2Tcs",
}
```