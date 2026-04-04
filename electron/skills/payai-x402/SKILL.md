---
name: payai-x402
description: Guide for building with the x402 payment protocol and PayAI facilitator on Solana. Covers monetizing APIs with payment middleware (Express, Hono, Next.js, FastAPI, Flask, Gin), building x402 clients (Fetch, Axios, httpx, Go net/http), facilitator integration, supported networks, and the x402 protocol reference.
---

# PayAI x402 Development Guide

Build paid APIs and AI agent payment flows using the x402 protocol with the PayAI facilitator on Solana.

## Overview

x402 is an open payment protocol that revives HTTP 402 "Payment Required" to enable stablecoin micropayments over plain HTTP. PayAI operates a multi-network facilitator that handles payment verification and settlement.

**Key features:**
- Pay-per-request pricing with USDC stablecoins
- Agent-native: AI agents discover and pay automatically
- Zero friction: no accounts, API keys, or sessions for buyers
- Gasless: buyers don't pay network fees
- Sub-second settlement
- Multi-language: TypeScript, Python, Go

**Protocol flow:**
1. Client requests a protected resource
2. Server responds 402 with `PAYMENT-REQUIRED` header (payment requirements as base64 JSON)
3. Client constructs payment and retries with `PAYMENT-SIGNATURE` header
4. Server verifies/settles via facilitator, returns resource with `PAYMENT-RESPONSE` header

## Quick Start

### Server (Express)

```bash
npx @payai/x402-express-starter@latest my-server
```

Set `.env`:
```env
SVM_ADDRESS=...     # Solana wallet to receive payments
```

```typescript
import { config } from "dotenv";
import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactSvmScheme } from "@x402/svm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { facilitator } from "@payai/facilitator";

config();

const svmAddress = process.env.SVM_ADDRESS;
if (!svmAddress) {
  console.error("Missing SVM_ADDRESS environment variable");
  process.exit(1);
}

const facilitatorClient = new HTTPFacilitatorClient(facilitator);
const app = express();

app.use(
  paymentMiddleware(
    {
      "GET /weather": {
        accepts: [
          {
            scheme: "exact",
            price: "$0.001",
            network: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
            payTo: svmAddress,
          },
        ],
        description: "Weather data",
        mimeType: "application/json",
      },
    },
    new x402ResourceServer(facilitatorClient)
      .register("solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1", new ExactSvmScheme()),
  ),
);

app.get("/weather", (req, res) => {
  res.send({ report: { weather: "sunny", temperature: 70 } });
});

app.listen(4021, () => console.log("Server listening at http://localhost:4021"));
```

### Client (Fetch)

```bash
npx @payai/x402-fetch-starter@latest my-client
```

Set `.env`:
```env
SVM_PRIVATE_KEY=...
RESOURCE_SERVER_URL=http://localhost:4021
ENDPOINT_PATH=/weather
```

```typescript
import { config } from "dotenv";
import { x402Client, wrapFetchWithPayment, x402HTTPClient } from "@x402/fetch";
import { registerExactSvmScheme } from "@x402/svm/exact/client";
import { createKeyPairSignerFromBytes } from "@solana/kit";
import { base58 } from "@scure/base";

config();

async function main() {
  const svmSigner = await createKeyPairSignerFromBytes(base58.decode(process.env.SVM_PRIVATE_KEY!));

  const client = new x402Client();
  registerExactSvmScheme(client, { signer: svmSigner });

  const fetchWithPayment = wrapFetchWithPayment(fetch, client);

  const response = await fetchWithPayment("http://localhost:4021/weather", { method: "GET" });
  const body = await response.json();
  console.log("Response:", body);

  if (response.ok) {
    const paymentResponse = new x402HTTPClient(client).getPaymentSettleResponse(
      name => response.headers.get(name),
    );
    console.log("Payment:", JSON.stringify(paymentResponse, null, 2));
  }
}

main();
```

## Server Frameworks

### Hono

```bash
npx @payai/x402-hono-starter@latest my-server
```

```typescript
import { config } from "dotenv";
import { paymentMiddleware, x402ResourceServer } from "@x402/hono";
import { ExactSvmScheme } from "@x402/svm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { facilitator } from "@payai/facilitator";
import { Hono } from "hono";
import { serve } from "@hono/node-server";

config();

const svmAddress = process.env.SVM_ADDRESS;
const facilitatorClient = new HTTPFacilitatorClient(facilitator);
const app = new Hono();

app.use(
  paymentMiddleware(
    {
      "GET /weather": {
        accepts: [
          { scheme: "exact", price: "$0.001", network: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1", payTo: svmAddress },
        ],
        description: "Weather data",
        mimeType: "application/json",
      },
    },
    new x402ResourceServer(facilitatorClient)
      .register("solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1", new ExactSvmScheme()),
  ),
);

app.get("/weather", c => c.json({ report: { weather: "sunny", temperature: 70 } }));

serve({ fetch: app.fetch, port: 4021 });
```

### Next.js

```bash
npx @payai/x402-next-starter@latest my-app
```

Next.js uses two approaches:

**`paymentProxy`** -- protects page routes via middleware:
```typescript
// proxy.ts
import { paymentProxy } from "@x402/next";
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { registerExactSvmScheme } from "@x402/svm/exact/server";
import { createPaywall } from "@x402/paywall";
import { svmPaywall } from "@x402/paywall/svm";
import { facilitator } from "@payai/facilitator";

const facilitatorClient = new HTTPFacilitatorClient(facilitator);
const server = new x402ResourceServer(facilitatorClient);
registerExactSvmScheme(server);

const paywall = createPaywall()
  .withNetwork(svmPaywall)
  .withConfig({ appName: "My App", testnet: true })
  .build();

export const proxy = paymentProxy(
  {
    "/protected": {
      accepts: [
        { scheme: "exact", price: "$0.001", network: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1", payTo: svmAddress },
      ],
      description: "Premium content",
      mimeType: "text/html",
    },
  },
  server, undefined, paywall,
);
```

**`withX402`** -- wraps individual API routes (settles only after successful response):
```typescript
// app/api/weather/route.ts
import { NextRequest, NextResponse } from "next/server";
import { withX402 } from "@x402/next";

const handler = async (_: NextRequest) => {
  return NextResponse.json({ report: { weather: "sunny", temperature: 72 } });
};

export const GET = withX402(
  handler,
  {
    accepts: [
      { scheme: "exact", price: "$0.001", network: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1", payTo: svmAddress },
    ],
    description: "Weather API",
    mimeType: "application/json",
  },
  server, undefined, paywall,
);
```

### FastAPI (Python)

```bash
pip install x402 fastapi uvicorn python-dotenv pydantic
```

```python
import os
from dotenv import load_dotenv
from fastapi import FastAPI
from x402.http import FacilitatorConfig, HTTPFacilitatorClient, PaymentOption
from x402.http.middleware.fastapi import PaymentMiddlewareASGI
from x402.http.types import RouteConfig
from x402.mechanisms.svm.exact import ExactSvmServerScheme
from x402.schemas import Network
from x402.server import x402ResourceServer

load_dotenv()

SVM_ADDRESS = os.getenv("SVM_ADDRESS")
SVM_NETWORK: Network = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1"

app = FastAPI()

facilitator = HTTPFacilitatorClient(FacilitatorConfig(url="https://facilitator.payai.network"))
server = x402ResourceServer(facilitator)
server.register(SVM_NETWORK, ExactSvmServerScheme())

routes = {
    "GET /weather": RouteConfig(
        accepts=[
            PaymentOption(scheme="exact", pay_to=SVM_ADDRESS, price="$0.01", network=SVM_NETWORK),
        ],
        mime_type="application/json",
        description="Weather report",
    ),
}
app.add_middleware(PaymentMiddlewareASGI, routes=routes, server=server)

@app.get("/weather")
async def get_weather():
    return {"report": {"weather": "sunny", "temperature": 70}}
```

### Gin (Go)

```bash
go get github.com/coinbase/x402/go github.com/gin-gonic/gin
```

```go
package main

import (
	"net/http"
	"os"
	"time"

	x402http "github.com/coinbase/x402/go/http"
	ginmw "github.com/coinbase/x402/go/http/gin"
	svm "github.com/coinbase/x402/go/mechanisms/svm/exact/server"
	ginfw "github.com/gin-gonic/gin"
)

func main() {
	svmAddress := os.Getenv("SVM_PAYEE_ADDRESS")

	r := ginfw.Default()

	facilitatorClient := x402http.NewHTTPFacilitatorClient(&x402http.FacilitatorConfig{
		URL: "https://facilitator.payai.network",
	})

	routes := x402http.RoutesConfig{
		"GET /weather": {
			Accepts: x402http.PaymentOptions{
				{Scheme: "exact", Price: "$0.001", Network: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1", PayTo: svmAddress},
			},
			Description: "Weather data",
			MimeType:    "application/json",
		},
	}

	r.Use(ginmw.X402Payment(ginmw.Config{
		Routes:      routes,
		Facilitator: facilitatorClient,
		Schemes: []ginmw.SchemeConfig{
			{Network: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1", Server: svm.NewExactSvmScheme()},
		},
		Timeout: 30 * time.Second,
	}))

	r.GET("/weather", func(c *ginfw.Context) {
		c.JSON(http.StatusOK, ginfw.H{"weather": "sunny", "temperature": 70})
	})

	r.Run(":4021")
}
```

## Client Libraries

### Axios (TypeScript)

```bash
npx @payai/x402-axios-starter@latest my-client
```

```typescript
import { x402Client, wrapAxiosWithPayment } from "@x402/axios";
import { registerExactSvmScheme } from "@x402/svm/exact/client";
import { createKeyPairSignerFromBytes } from "@solana/kit";
import { base58 } from "@scure/base";
import axios from "axios";

const client = new x402Client();
registerExactSvmScheme(client, { signer: await createKeyPairSignerFromBytes(base58.decode(svmPrivateKey)) });

const api = wrapAxiosWithPayment(axios.create(), client);
const response = await api.get("http://localhost:4021/weather");
console.log(response.data);
```

### httpx (Python)

```bash
pip install x402 httpx
```

```python
from x402 import x402Client
from x402.http.clients import x402HttpxClient
from x402.mechanisms.svm.exact.register import register_exact_svm_client
from x402.mechanisms.svm import KeypairSigner

client = x402Client()
register_exact_svm_client(client, KeypairSigner.from_base58(svm_private_key))

async with x402HttpxClient(client) as http:
    response = await http.get("http://localhost:4021/weather")
    print(response.text)
```

### Go (net/http)

```go
svmSigner, _ := svmsigners.NewClientSignerFromPrivateKey(svmPrivateKey)
client := x402.Newx402Client()
client.Register("solana:*", svm.NewExactSvmScheme(svmSigner))

httpClient := x402http.Newx402HTTPClient(client)
wrappedClient := x402http.WrapHTTPClientWithPayment(http.DefaultClient, httpClient)

req, _ := http.NewRequest("GET", "http://localhost:4021/weather", nil)
resp, _ := wrappedClient.Do(req)
```

## PayAI Facilitator

The PayAI facilitator handles payment verification and settlement. All starter templates include `@payai/facilitator` which connects automatically.

```typescript
import { facilitator } from "@payai/facilitator";
import { HTTPFacilitatorClient } from "@x402/core/server";

const facilitatorClient = new HTTPFacilitatorClient(facilitator);
```

### Facilitator Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/verify` | POST | Verify payment without executing on-chain |
| `/settle` | POST | Settle payment on blockchain |
| `/supported` | GET | List supported schemes and networks |
| `/discovery/resources` | GET | Bazaar: discover x402-enabled resources |

### Pricing

| Tier | Cost | Settlements | API Key |
|------|------|-------------|---------|
| Free | $0/month | Up to 1,000/month | Not required |
| Production | $0.001/transaction | Unlimited (credit-based) | Required |

For production, create a merchant account at [merchant.payai.network](https://merchant.payai.network) and set:

```env
PAYAI_API_KEY_ID=your-key-id
PAYAI_API_KEY_SECRET=your-key-secret
```

## Supported Networks

| Network | CAIP-2 ID |
|---------|-----------|
| Avalanche | `eip155:43114` |
| Avalanche Fuji | `eip155:43113` |
| Base | `eip155:8453` |
| Base Sepolia | `eip155:84532` |
| Polygon | `eip155:137` |
| Polygon Amoy | `eip155:80002` |
| Sei | `eip155:1329` |
| Sei Testnet | `eip155:713715` |
| SKALE Base | `eip155:1187947933` |
| SKALE Base Sepolia | `eip155:324705682` |
| Solana | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` |
| Solana Devnet | `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` |
| X Layer | `eip155:196` |
| X Layer Testnet | `eip155:1952` |

**Supported asset:** USDC

## Protocol Reference

### HTTP Headers

| Header | Direction | Encoding | Description |
|--------|-----------|----------|-------------|
| `PAYMENT-REQUIRED` | Server -> Client (402) | Base64 JSON | Payment requirements |
| `PAYMENT-SIGNATURE` | Client -> Server | Base64 JSON | Payment proof |
| `PAYMENT-RESPONSE` | Server -> Client (200) | Base64 JSON | Settlement details |

### Payment Requirements (402 response)

```json
{
  "x402Version": 2,
  "error": "PAYMENT-SIGNATURE header is required",
  "resource": {
    "url": "https://api.example.com/data",
    "description": "Premium data",
    "mimeType": "application/json"
  },
  "accepts": [
    {
      "scheme": "exact",
      "network": "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
      "amount": "1000000",
      "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "payTo": "YourSolanaAddress",
      "maxTimeoutSeconds": 60,
      "extra": { "feePayer": "FacilitatorAddress" }
    }
  ]
}
```

### Payment Proof (PAYMENT-SIGNATURE)

```json
{
  "x402Version": 2,
  "scheme": "exact",
  "network": "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
  "accepted": { "...selected payment requirement..." },
  "payload": {
    "transaction": "base64-encoded partially-signed transaction"
  }
}
```

### Settlement Response (PAYMENT-RESPONSE)

```json
{
  "success": true,
  "transaction": "txhash...",
  "network": "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
  "payer": "PayerAddress"
}
```

### Route Configuration Pattern

Routes follow the format `"METHOD /path"`:

```typescript
{
  "GET /api/data": {
    accepts: [
      {
        scheme: "exact",          // Payment scheme
        price: "$0.01",           // Human-readable price (converted to atomic units)
        network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",  // CAIP-2 network ID
        payTo: "YourAddress",     // Receiving wallet
      },
    ],
    description: "Description of the resource",
    mimeType: "application/json",
  },
}
```

### Starter Templates

| Template | Command |
|----------|---------|
| Express server | `npx @payai/x402-express-starter@latest my-server` |
| Hono server | `npx @payai/x402-hono-starter@latest my-server` |
| Next.js fullstack | `npx @payai/x402-next-starter@latest my-app` |
| Fetch client | `npx @payai/x402-fetch-starter@latest my-client` |
| Axios client | `npx @payai/x402-axios-starter@latest my-client` |

## Testing

Use the PayAI Echo Merchant at [x402.payai.network](https://x402.payai.network) for free end-to-end testing. All tokens are refunded and PayAI covers network fees.

Available Solana test endpoints:
- `/api/solana-devnet/paid-content`
- `/api/solana-mainnet/paid-content`

## Error Codes

| Code | Description |
|------|-------------|
| `insufficient_funds` | Payer lacks sufficient token balance |
| `invalid_network` | Network not supported |
| `invalid_scheme` | Scheme not supported |
| `invalid_payload` | Malformed payment payload |
| `invalid_exact_svm_payload_transaction_instructions_length` | SVM transaction must have exactly 3 instructions |

## Resources

- [PayAI Documentation](https://docs.payai.network)
- [x402 Protocol Repository](https://github.com/coinbase/x402)
- [PayAI GitHub](https://github.com/PayAINetwork)
- [PayAI Facilitator](https://facilitator.payai.network)
- [Echo Merchant (free testing)](https://x402.payai.network)
- [Merchant Dashboard](https://merchant.payai.network)
- [Discord](https://discord.gg/eWJRwMpebQ)
