# HardwareGuru - API Gateway & BFF

API Gateway y Backend-For-Frontend (BFF) desarrollado con **NestJS** para el ecosistema **HardwareGuru**. Actúa como el punto de entrada unificado para el cliente Frontend (React), orquestando las llamadas a los microservicios del backend mediante **gRPC** y **HTTP**, aplicando validación, observabilidad y transformación de datos.

---

## 1. Arquitectura del Sistema

```text
+---------------------------------------------------------------------------------------------------+
|                                         Frontend (React)                                          |
+-------------------------------------------------+-------------------------------------------------+
                                                  |
                                                  | HTTP / REST (JSON)
                                                  | - Prefijo global: /api
                                                  | - CORS habilitado
                                                  v
+---------------------------------------------------------------------------------------------------+
|                                     API Gateway / BFF (NestJS)                                    |
|  - Seguridad perimetral (APP_GUARD): JWT HS256 / JWKS (caché única), exp, roles/scopes y API Keys |
|  - Sanitización y propagación de identidad (x-user-id, x-user-role, x-tenant-id)                  |
|  - Validación de DTOs (ValidationPipe + class-validator)                                          |
|  - Deserialización nativa de JSON (specs y benchmarks) y normalización camelCase <-> snake_case   |
|  - Orquestación IDs -> métricas vía Catálogo antes de simular                                     |
|  - Proxy HTTP hacia Auth Service (:4000) y MCP Server (:3001, timeout 45s)                        |
|  - Deadlines gRPC (3000 ms) y mapeo de errores (400, 401, 403, 404, 501-504)                      |
|  - Telemetría y tracing con NestJS Observe                                                        |
+--------+--------------------------+-----------------------------+-------------------------------+
         |                          |                             |                               |
         | HTTP (:4000)             | gRPC (:50051)               | gRPC (:9090)                  | HTTP (:3001)
         | /api/auth/* + x-user-id  | hardware.proto              | simulator.proto               | POST /chat + x-user-id
         v                          v                             v                               v
+--------------------------------+  +--------------------------+  +----------------------------+  +--------------------------+
|  Auth Service (Node.js)        |  |  Catálogo (Go)           |  |  Simulador (Java)          |  |  MCP Server / IA (Node)  |
|  - Registro, Login, Perfil     |  |  - CatalogoService       |  |  - SimulatorService        |  |  - Gemini + Tool Calling |
|  - Emisión JWT HS256 (4h)      |  |  - PostgreSQL            |  |  - PostgreSQL              |  |  - Llama a Simulador     |
|  - PostgreSQL (users)          |  |  - Compatibilidad        |  |  - Consumo / Bottleneck    |  |  - Respuestas IA         |
+--------------------------------+  +--------------------------+  +----------------------------+  +--------------------------+
```

---

## 2. Estructura del Proyecto

```text
hardwareguru-api-gateway/
├── src/
│   ├── auth/                           # Módulo de Autenticación y Seguridad Gateway (Integrado)
│   │   ├── decorators/
│   │   │   └── auth.decorators.ts      # @Public, @OptionalAuth, @Roles, @Scopes, @RequireApiKey
│   │   ├── dto/
│   │   │   └── auth.dto.ts             # DTOs de validación (RegisterDto, LoginDto, UpdateProfileDto)
│   │   ├── guards/
│   │   │   ├── gateway-auth.guard.ts   # APP_GUARD global: JWT/JWKS, API Keys, roles/scopes, headers
│   │   │   └── gateway-auth.guard.spec.ts
│   │   ├── interfaces/
│   │   │   └── auth.interface.ts       # Contratos de usuario autenticado, API keys y respuestas
│   │   ├── services/
│   │   │   ├── api-key.service.ts      # Validación en tiempo constante de API Keys activas
│   │   │   ├── api-key.service.spec.ts
│   │   │   ├── token-verifier.service.ts # Verificación local HS256 / JWKS (caché única) y exp
│   │   │   └── token-verifier.service.spec.ts
│   │   ├── auth.constants.ts           # Constantes de headers y metadata keys
│   │   ├── auth.controller.ts          # Proxy REST (/api/auth/register, /login, /me, /profile)
│   │   ├── auth.service.ts             # Cliente HTTP hacia auth-service y mapeo de errores
│   │   ├── auth.module.ts              # Configuración AuthModule
│   │   ├── auth.controller.spec.ts
│   │   └── auth.service.spec.ts
│   ├── catalogo/                       # Módulo del Microservicio de Catálogo (Integrado)
│   │   ├── dto/
│   │   │   └── build.dto.ts            # DTO de validación para verificación de compatibilidad
│   │   ├── interfaces/
│   │   │   └── catalogo.interface.ts   # Contratos TypeScript y tipos del cliente gRPC
│   │   ├── proto/
│   │   │   └── hardware.proto          # Definición Protocol Buffers del servicio de catálogo
│   │   ├── catalogo.controller.ts      # Controlador REST (/api/componentes y /api/compatibilidad)
│   │   ├── catalogo.service.ts         # Cliente gRPC, deserialización JSON y mapeo de errores
│   │   ├── catalogo.module.ts          # Configuración del cliente gRPC (@nestjs/microservices)
│   │   ├── catalogo.controller.spec.ts # Pruebas unitarias del controlador
│   │   └── catalogo.service.spec.ts    # Pruebas unitarias del servicio
│   ├── simulador/                      # Módulo del Microservicio Simulador (Integrado)
│   │   ├── dto/
│   │   │   └── simular.dto.ts          # DTOs de simulación (métricas directas o IDs) y GuardarBuild
│   │   ├── interfaces/
│   │   │   └── simulador.interface.ts  # Contratos TypeScript y tipos del cliente gRPC
│   │   ├── proto/
│   │   │   └── simulator.proto         # Definición Protocol Buffers del servicio simulador
│   │   ├── simulador.controller.ts     # Controladores (/api/simulador, /api/simulaciones, /api/simular)
│   │   ├── simulador.service.ts        # Cliente gRPC (deadline 3s), orquestación y mapeo de errores
│   │   ├── simulador.module.ts         # Configuración del cliente gRPC e importación de CatalogoModule
│   │   ├── simulador.controller.spec.ts# Pruebas unitarias del controlador
│   │   └── simulador.service.spec.ts   # Pruebas unitarias del servicio
│   ├── chat/                           # Módulo del Microservicio MCP Server / IA (Integrado)
│   │   ├── dto/
│   │   │   └── chat.dto.ts             # DTO de entrada (prompt directo o mensaje + historial)
│   │   ├── interfaces/
│   │   │   └── chat.interface.ts       # Contratos HTTP de entrada/salida hacia MCP Server
│   │   ├── chat.controller.ts          # Controlador REST (/api/chat) e inyección de x-user-id
│   │   ├── chat.service.ts             # Cliente HTTP (@nestjs/axios, timeout 45s) y mapeo de errores
│   │   ├── chat.module.ts              # Configuración de HttpModule (MCP_TIMEOUT_MS)
│   │   ├── chat.controller.spec.ts     # Pruebas unitarias del controlador
│   │   └── chat.service.spec.ts        # Pruebas unitarias del servicio
│   ├── common/
│   │   └── proto/
│   │       ├── hardware.proto          # Contrato Protobuf compartido de catálogo
│   │       └── simulator.proto         # Contrato Protobuf compartido de simulador
│   ├── alerts/                         # Módulo preparado para microservicio de alertas
│   ├── kafka/                          # Módulo preparado para mensajería asíncrona Kafka
│   ├── app.module.ts                   # Módulo raíz (ConfigModule, ObserveModule, etc.)
│   └── main.ts                         # Bootstrap (Prefijo /api, CORS, ValidationPipe, Tracing)
├── test/                               # Pruebas End-to-End (e2e)
│   ├── app.e2e-spec.ts
│   └── jest-e2e.json
├── nest-cli.json                       # Copia automática de assets .proto a dist/
├── tsconfig.json                       # Configuración de TypeScript
└── .env.example                        # Plantilla de variables de entorno
```

---

## 3. Puesta en Marcha

### Requisitos Previos
- **Node.js**: v20.19+ o v22.12+ (soporte nativo ESM)
- **npm**: v10+
- **Microservicio Auth Service en ejecución**: Servicio Node.js levantado en el puerto `4000` (`AUTH_SERVICE_URL=http://localhost:4000`) compartiendo el mismo `JWT_SECRET`.
- **Microservicio de Catálogo en ejecución**: Servicio Go levantado en el puerto `50051` (vía `docker compose up -d` en `hardwareguru-catalogo`).
- **Microservicio Simulador en ejecución**: Servicio Spring Boot gRPC levantado en el puerto `9090` (`hardwareguru-simulador` / `SimulatorService`).
- **Microservicio MCP Server en ejecución**: Servicio Node.js (`Taller2-Arquitectura-2-MCP-Server`) levantado en `MCP_SERVICE_URL` (por defecto `http://localhost:3001` en local para no colisionar con el puerto `3000` del Gateway).

### Paso 1: Configurar Variables de Entorno
Copia el archivo de plantilla `.env.example` a `.env`:

```bash
cp .env.example .env
```

Configuración requerida en `.env`:
```env
PORT=3000
NODE_ENV=development

# Auth Service y Seguridad API Gateway
AUTH_SERVICE_URL=http://localhost:4000
AUTH_TIMEOUT_MS=5000
JWT_SECRET=super_secreto_hardwareguru_2026
# Opcional: validación asimétrica vía JWKS (descarga claves públicas una sola vez)
# AUTH_JWKS_URL=http://localhost:4000/.well-known/jwks.json
# JWT_ISSUER=hardwareguru-auth
# JWT_AUDIENCE=hardwareguru-api
# Opcional: API Keys (JSON array o lista separada por comas key:name:active)
# API_KEYS=[{"key":"hg_dev_key_123","name":"frontend-web","active":true,"role":"service","tenantId":"hardwareguru"}]
# REQUIRE_API_KEY=false

# Clientes gRPC
CATALOGO_GRPC_URL=localhost:50051
SIMULADOR_GRPC_URL=localhost:9090

# Kafka
KAFKA_BROKERS=localhost:9092
KAFKA_CLIENT_ID=api-gateway-producer

# Microservicios HTTP
ALERTS_SERVICE_URL=http://localhost:5001
MCP_SERVICE_URL=http://localhost:3001
MCP_TIMEOUT_MS=45000
```

### Paso 2: Instalar Dependencias
```bash
npm install
```

### Paso 3: Ejecutar la Aplicación

```bash
# Modo desarrollo con recarga automática
npm run start:dev

# Modo producción
npm run build
npm run start:prod
```

El servidor iniciará en: **`http://localhost:3000/api`**.

### Paso 4: Ejecutar Pruebas y Linter

```bash
# Pruebas unitarias
npm test

# Pruebas End-to-End (e2e)
npm run test:e2e

# Linter de código
npm run lint
```

---

## 4. Contratos de Integración para el Frontend (Módulo Catálogo)

> **Prefijo Base de la API:** `http://localhost:3000/api`  
> **CORS:** Habilitado para todos los orígenes (`*`).  
> **Headers requeridos en peticiones POST:** `Content-Type: application/json`

---

### 4.1. Listar Componentes

Retorna un listado resumido de componentes disponibles. Permite filtrar opcionalmente por tipo de componente.

- **Método:** `GET`
- **Ruta:** `/api/componentes`
- **Query Params (opcional):**
  - `tipo`: Tipo de hardware a filtrar (`cpu`, `placa`, `ram`, `gpu`, `fuente`). Si se omite, retorna todos los componentes.

#### Ejemplo de Solicitud:
```http
GET /api/componentes?tipo=cpu HTTP/1.1
Host: localhost:3000
```

#### Ejemplo de Respuesta (`200 OK`):
```json
[
  {
    "id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
    "tipo": "cpu",
    "nombre": "AMD Ryzen 5 5600X",
    "fabricante": "AMD",
    "tdp": 65,
    "socket": "AM4",
    "tipo_ram": "DDR4",
    "potencia_w": 65,
    "origen": "catalogo"
  },
  {
    "id": "b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e",
    "tipo": "cpu",
    "nombre": "Intel Core i5-13600K",
    "fabricante": "Intel",
    "tdp": 125,
    "socket": "LGA1700",
    "tipo_ram": "DDR5",
    "potencia_w": 181,
    "origen": "catalogo"
  }
]
```

---

### 4.2. Obtener Detalle y Especificaciones de un Componente

Obtiene el detalle completo de un componente por su identificador único.

> **Importante para el Frontend:**  
> A diferencia de la comunicación gRPC interna que transporta strings serializados, el API Gateway **deserializa automáticamente** los campos `especificaciones_json` y `benchmarks_json` entregando objetos JavaScript/JSON nativos (`especificaciones` y `benchmarks`).

- **Método:** `GET`
- **Ruta:** `/api/componentes/:id`

#### Ejemplo de Solicitud:
```http
GET /api/componentes/a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d HTTP/1.1
Host: localhost:3000
```

#### Ejemplo de Respuesta (`200 OK`):
```json
{
  "id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
  "tipo": "cpu",
  "nombre": "AMD Ryzen 5 5600X",
  "fabricante": "AMD",
  "tdp": 65,
  "socket": "AM4",
  "tipoRam": "DDR4",
  "potenciaW": 65,
  "origen": "catalogo",
  "especificaciones": {
    "nucleos": 6,
    "hilos": 12,
    "frecuencia_base_ghz": 3.7,
    "frecuencia_turbo_ghz": 4.6,
    "cache_l3_mb": 32,
    "litografia_nm": 7
  },
  "benchmarks": {
    "cinebench_r23_single": 1500,
    "cinebench_r23_multi": 11200,
    "passmark_cpu": 22100
  }
}
```

#### Posibles Respuestas de Error:
- `404 Not Found`: Si el ID no existe en la base de datos.
  ```json
  {
    "statusCode": 404,
    "message": "componente no encontrado con ID: '...'",
    "error": "Not Found"
  }
  ```

---

### 4.3. Verificar Compatibilidad de un Build

Evalúa una combinación de componentes según las reglas de negocio del microservicio (compatibilidad de socket CPU-Placa, estándar de memoria RAM, potencia suficiente de la fuente, etc.).

- **Método:** `POST`
- **Rutas Disponibles:**
  - `/api/componentes/compatibilidad` *(Ruta principal)*
  - `/api/compatibilidad` *(Alias directo)*
- **Body:** Admite tanto notación `camelCase` como `snake_case`.

#### Campos del Body:
| Campo (`camelCase`) | Campo (`snake_case`) | Tipo | Requerido | Descripción |
| :--- | :--- | :--- | :---: | :--- |
| `cpuId` | `cpu_id` | string | Sí | ID del procesador |
| `motherboardId` | `motherboard_id` | string | Sí | ID de la placa madre |
| `ramId` | `ram_id` | string | Sí | ID del módulo de memoria RAM |
| `gpuId` | `gpu_id` | string | No | ID de la tarjeta gráfica (opcional) |
| `psuId` | `psu_id` | string | Sí | ID de la fuente de poder |
| `ramCantidad` | `ram_cantidad` | number | No | Cantidad de módulos RAM (defecto: `1`) |

#### Ejemplo de Solicitud (Build Compatible):
```http
POST /api/componentes/compatibilidad HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{
  "cpuId": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
  "motherboardId": "c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f",
  "ramId": "d4e5f6a7-b8c9-0d1e-2f3a-4b5c6d7e8f9a",
  "gpuId": "e5f6a7b8-c9d0-1e2f-3a4b-5c6d7e8f9a0b",
  "psuId": "f6a7b8c9-d0e1-2f3a-4b5c-6d7e8f9a0b1c",
  "ramCantidad": 2
}
```

#### Respuesta Compatible (`200 OK`):
```json
{
  "compatible": true,
  "errores": [],
  "consumoEstimadoW": 420
}
```

#### Respuesta con Incompatibilidades (`200 OK`):
Si los componentes no son compatibles físicamente o eléctricamente, `compatible` será `false` y `errores` detallará las causas:
```json
{
  "compatible": false,
  "errores": [
    "Incompatibilidad de socket: la CPU requiere socket AM4 pero la placa madre tiene socket LGA1700",
    "Incompatibilidad de memoria RAM: la placa madre usa DDR5 pero el módulo seleccionado es DDR4"
  ],
  "consumoEstimadoW": 550
}
```

---

## 5. Contratos de Integración (Módulo Simulador)

El módulo `SimuladorModule` se conecta por **gRPC** al microservicio Java (`SimulatorService` en el puerto `9090`, contrato `simulator.proto`) aplicando un **deadline/timeout de `3000 ms`**, validaciones defensivas previas y orquestación automática con `CatalogoService` cuando se envían IDs de componentes en lugar de métricas numéricas.

---

### 5.1. Simular Rendimiento (API / Orquestación)

Calcula el consumo estimado total, porcentaje de cuello de botella y estado de riesgo de una configuración.

- **Método:** `POST`
- **Rutas Disponibles:**
  - `/api/simulador/calcular` *(Ruta principal)*
  - `/api/simulaciones` *(Alias REST)*
  - `/api/simulador` *(Alias directo)*
- **Modos de entrada admitidos (en `camelCase` o `snake_case`):**
  1. **Métricas directas:** `cpuTdpWatts`, `cpuBenchmarkScore` (`> 0`), `gpuTdpWatts`, `gpuBenchmarkScore` (`> 0`), `psuWatts` (`> 0`), `resolucion`.
  2. **Orquestación por IDs:** `cpuId`, `gpuId`, `psuId` (o `fuenteId`), `resolucion`. El Gateway consulta en paralelo a `CatalogoService` (`obtenerSpecs`) para resolver TDP, potencia y puntajes de benchmark (`passmark_*`, `timespy`, `cinebench_r23_multi` o `cinebenchR24`) antes de invocar al simulador.
- **Identificación de usuario (`userId`):** Si existe sesión autenticada (`req.user`) o header `x-user-id`, se utiliza ese ID; en caso contrario toma `userId`/`user_id` del body o `"0"` (modo invitado, sin persistencia en PostgreSQL del simulador).

#### Ejemplo de Solicitud con Métricas Directas:
```http
POST /api/simulador/calcular HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{
  "userId": "user-123",
  "cpuTdpWatts": 125,
  "cpuBenchmarkScore": 28000,
  "gpuTdpWatts": 220,
  "gpuBenchmarkScore": 25000,
  "psuWatts": 750,
  "resolucion": "1440p"
}
```

#### Ejemplo de Solicitud por IDs (Orquestada con Catálogo):
```http
POST /api/simulaciones HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{
  "cpuId": "cpu-9600x",
  "gpuId": "gpu-4060",
  "fuenteId": "psu-650",
  "resolucion": "1080p"
}
```

#### Respuesta (`200 OK`):
```json
{
  "consumoTotalWatts": 395,
  "cuelloBotellaPorcentaje": 0,
  "estado": "Óptimo",
  "motivo": "Tu sistema está perfectamente balanceado."
}
```

---

### 5.2. Simular Build para el Frontend (`POST /api/simular`)

Endpoint BFF adaptado al contrato del cliente React (`hardwareguru-frontend`). Si se envían los componentes completos (`cpuId`, `placaId`/`motherboardId`, `ramId`, `gpuId`, `fuenteId`/`psuId`), verifica primero la compatibilidad física/eléctrica en `CatalogoService` y luego ejecuta la simulación en `SimulatorService`.

- **Método:** `POST`
- **Ruta:** `/api/simular`

#### Ejemplo de Solicitud:
```json
{
  "cpuId": "cpu-9600x",
  "placaId": "mb-b650",
  "ramId": "ram-ddr5-16",
  "gpuId": "gpu-4060",
  "fuenteId": "psu-650",
  "resolucion": "1080p"
}
```

#### Respuesta (`200 OK`):
```json
{
  "consumoEstimadoW": 230,
  "cuelloBotellaPct": 0,
  "resolucion": "1080p",
  "estado": "BALANCEADO",
  "motivo": null
}
```
> Valores posibles de `estado`: `"BALANCEADO"`, `"RIESGO"` (cuando el simulador reporta `"Desbalanceado"` o `"Riesgo Crítico"`) o `"INCOMPATIBLE"` (cuando falla la validación de compatibilidad en Catálogo).

---

### 5.3. Guardar Build (`POST /api/simulador/builds`)

Expone el RPC `GuardarBuild` definido en `simulator.proto`. **Requiere autenticación (`Authorization: Bearer <token>`).**

- **Método:** `POST`
- **Ruta:** `/api/simulador/builds`
- **Acceso:** Protegido (`401 Unauthorized` si falta el token o es inválido).
- **Estado actual en el microservicio Simulador:** El RPC `GuardarBuild` está declarado en `simulator.proto` pero pendiente de implementación en `SimulatorServiceImpl`, por lo que al invocarlo autenticado actualmente el Gateway responderá `501 Not Implemented` (mapeado desde gRPC `UNIMPLEMENTED`).

---

### 5.4. Mapeo de Errores gRPC a HTTP (Simulador)

| Código gRPC | Significado | Respuesta HTTP en Gateway |
| :--- | :--- | :--- |
| `OK (0)` | Simulación exitosa | `200 OK` |
| `INVALID_ARGUMENT (3)` | Datos inválidos (o validación previa en DTO/servicio) | `400 Bad Request` |
| `DEADLINE_EXCEEDED (4)` | Timeout al simular (`> 3000 ms`) | `504 Gateway Timeout` |
| `NOT_FOUND (5)` | Recurso no encontrado | `404 Not Found` |
| `UNIMPLEMENTED (12)` | RPC no implementado (ej. `GuardarBuild`) | `501 Not Implemented` |
| `UNAVAILABLE (14)` | Microservicio simulador apagado o inaccesible | `503 Service Unavailable` |
| `INTERNAL (13)` / `UNKNOWN (2)` | Error interno en el simulador | `502 Bad Gateway` |

---

## 6. Contratos de Integración (Módulo Chat / MCP Server IA)

El módulo `ChatModule` reenvía las consultas de lenguaje natural por **HTTP** al microservicio **MCP Server** (`MCP_SERVICE_URL`, por defecto `http://localhost:3001`, endpoint `POST /chat`) con un **timeout amplio de `45000 ms`** (`MCP_TIMEOUT_MS`), pensado para soportar hasta dos llamadas a Gemini más la invocación gRPC al Simulador (`:9090`).

---

### 6.1. Enviar Mensaje al Asistente IA (`POST /api/chat`)

- **Método:** `POST`
- **Ruta:** `/api/chat`
- **Acceso:** **Protegido** (requiere `Authorization: Bearer <token>` válido; si falta o es inválido/expirado, el Gateway corta la petición con `401 Unauthorized` antes de llamar al MCP Server).
- **Identificación de usuario (`x-user-id`, `x-user-role`, `x-tenant-id`):**
  - El Gateway valida el JWT localmente, **descarta** cualquier `x-user-id` o `userId` falsificado por el cliente e inyecta hacia el MCP Server las cabeceras limpias extraídas del token (`x-user-id`, `x-user-role` y `x-tenant-id` si aplica).
- **Formatos de Body admitidos:**
  1. **Directo (contrato MCP):** `{ "prompt": "..." }`
  2. **Frontend React:** `{ "mensaje": "...", "historial": [...] }` (el Gateway adapta automáticamente el historial reciente y el mensaje en un único `prompt`).

#### Ejemplo de Solicitud desde el Frontend React:
```http
POST /api/chat HTTP/1.1
Host: localhost:3000
Content-Type: application/json
Authorization: Bearer <JWT>

{
  "mensaje": "¿Me alcanza una fuente de 550W para esta build?",
  "historial": [
    { "rol": "usuario", "texto": "Tengo un Ryzen 5 9600X y RTX 4060" }
  ]
}
```

#### Respuesta (`200 OK`):
```json
{
  "respuesta": "El consumo estimado es de 315W..."
}
```

---

### 6.2. Mapeo de Errores HTTP (Chat / MCP)

| Condición / Respuesta MCP | Respuesta HTTP en Gateway |
| :--- | :--- |
| `200 OK` | `200 OK` (`{ "respuesta": "..." }`) |
| `prompt` y `mensaje` ausentes o vacíos / `400` del MCP | `400 Bad Request` |
| Sin token, token inválido/expirado o `401` del MCP | `401 Unauthorized` |
| Timeout (`> MCP_TIMEOUT_MS`, por defecto `45000 ms`) | `504 Gateway Timeout` |
| MCP Server caído (`ECONNREFUSED`) o error interno `5xx` del MCP | `502 Bad Gateway` |

> **Nota operativa:** El MCP Server no expone `GET /health` en su versión actual (si usas balanceador, verifica TCP en el puerto configurado en `MCP_SERVICE_URL`) y, si corre en contenedores separados del Simulador, parametriza su dirección gRPC para no depender de `localhost:9090`.

---

## 7. Contratos de Integración para el Frontend (Módulo Auth & Seguridad)

El módulo `AuthModule` actúa como proxy seguro hacia el **Auth Service** (`AUTH_SERVICE_URL`, por defecto `http://localhost:4000`) y habilita el guard global `GatewayAuthGuard` sobre todo el API Gateway.

### Reglas de Seguridad para el Frontend

1. **Autenticación con Bearer JWT:**
   - Tras hacer login en `POST /api/auth/login`, el Frontend debe almacenar el `token` y enviarlo en la cabecera `Authorization: Bearer <token>` en todas las rutas protegidas.
   - Si el Frontend envía un token inválido o expirado en **cualquier** ruta (incluso rutas públicas de Catálogo/Simulador con sesión opcional), el Gateway responderá `401 Unauthorized` de inmediato.
2. **No enviar `x-user-id` manualmente:**
   - El Gateway **sanitiza y sobrescribe** `x-user-id`, `x-user-role` y `x-tenant-id` en todas las peticiones entrantes; la identidad siempre proviene del JWT verificado.
3. **API Keys (`x-api-key`, opcional):**
   - Si `REQUIRE_API_KEY=true` en el Gateway o si el Frontend envía `x-api-key`, esta se valida contra `API_KEYS` (rechazando con `401 Unauthorized` si no existe o está inactiva).
4. **Rutas internas bloqueadas:**
   - `GET /api/auth/users/:id` es de uso exclusivo entre microservicios internos y **no está expuesta** en el Gateway (`404 Not Found`).

### Matriz de Acceso por Endpoint

| Endpoint | Acceso | Comportamiento sin token |
| :--- | :--- | :--- |
| `POST /api/auth/register` | **Público** | Permitido |
| `POST /api/auth/login` | **Público** | Permitido |
| `GET /api/auth/me` | **Protegido (JWT)** | `401 Unauthorized` |
| `PUT /api/auth/profile` | **Protegido (JWT)** | `401 Unauthorized` |
| `GET /api/componentes`, `GET /api/componentes/:id`, `POST /api/componentes/compatibilidad`, `POST /api/compatibilidad` | **Opcional (Invitado o JWT)** | Permitido (si envía token inválido → `401`) |
| `POST /api/simular`, `POST /api/simulador`, `POST /api/simulador/calcular`, `POST /api/simulaciones` | **Opcional (Invitado o JWT)** | Modo invitado `"0"` (si envía token válido, asocia `userId`; si es inválido → `401`) |
| `POST /api/simulador/builds` | **Protegido (JWT)** | `401 Unauthorized` |
| `POST /api/chat` | **Protegido (JWT)** | `401 Unauthorized` |

---

### 7.1. Registrar Usuario (`POST /api/auth/register`)

- **Método:** `POST`
- **Ruta:** `/api/auth/register`
- **Acceso:** Público

#### Body (`application/json`):
| Campo | Tipo | Requerido | Validación en Gateway |
| :--- | :--- | :---: | :--- |
| `nombre` | string | Sí | No vacío |
| `email` | string | Sí | Formato email válido |
| `password` | string | Sí | Mínimo `6` caracteres |

#### Ejemplo de Solicitud:
```http
POST /api/auth/register HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{
  "nombre": "User",
  "email": "user@hardwareguru.cl",
  "password": "password123"
}
```

#### Respuesta Exitosa (`201 Created`):
```json
{
  "mensaje": "Usuario registrado exitosamente",
  "user": {
    "id": 2,
    "nombre": "User",
    "email": "user@hardwareguru.cl"
  }
}
```

---

### 7.2. Iniciar Sesión (`POST /api/auth/login`)

- **Método:** `POST`
- **Ruta:** `/api/auth/login`
- **Acceso:** Público

#### Body (`application/json`):
| Campo | Tipo | Requerido | Validación en Gateway |
| :--- | :--- | :---: | :--- |
| `email` | string | Sí | Formato email válido |
| `password` | string | Sí | No vacío |

#### Ejemplo de Solicitud:
```http
POST /api/auth/login HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{
  "email": "user@hardwareguru.cl",
  "password": "password123"
}
```

#### Respuesta Exitosa (`200 OK`):
```json
{
  "mensaje": "Login exitoso",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 2,
    "nombre": "User",
    "email": "user@hardwareguru.cl"
  }
}
```

---

### 7.3. Obtener Perfil del Usuario Autenticado (`GET /api/auth/me`)

- **Método:** `GET`
- **Ruta:** `/api/auth/me`
- **Acceso:** Protegido (`Authorization: Bearer <token>`)

#### Ejemplo de Solicitud:
```http
GET /api/auth/me HTTP/1.1
Host: localhost:3000
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### Respuesta Exitosa (`200 OK`):
```json
{
  "id": 2,
  "nombre": "User",
  "email": "user@hardwareguru.cl"
}
```

---

### 7.4. Actualizar Perfil (`PUT /api/auth/profile`)

- **Método:** `PUT`
- **Ruta:** `/api/auth/profile`
- **Acceso:** Protegido (`Authorization: Bearer <token>`)

#### Body (`application/json`):
| Campo | Tipo | Requerido | Validación en Gateway |
| :--- | :--- | :---: | :--- |
| `nombre` | string | No | Si se envía, no puede estar vacío |
| `newPassword` | string | No | Si se envía, mínimo `6` caracteres |

#### Ejemplo de Solicitud:
```http
PUT /api/auth/profile HTTP/1.1
Host: localhost:3000
Content-Type: application/json
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

{
  "nombre": "User Guru",
  "newPassword": "nuevaPassword123"
}
```

#### Respuesta Exitosa (`200 OK`):
```json
{
  "mensaje": "Perfil actualizado correctamente",
  "usuario": {
    "id": 2,
    "nombre": "User Guru",
    "email": "user@hardwareguru.cl"
  }
}
```

> **Nota para el Frontend:** `POST /api/auth/register` y `POST /api/auth/login` devuelven el objeto del usuario bajo la clave `user`, mientras que `PUT /api/auth/profile` lo devuelve bajo la clave `usuario` (contrato nativo de `auth-service`).

---

### 7.5. Mapeo de Errores HTTP (Auth & Seguridad Gateway)

| Condición / Respuesta | Respuesta HTTP en Gateway |
| :--- | :--- |
| DTO inválido (`email`, `password < 6`, campos desconocidos) | `400 Bad Request` |
| Sin token, formato `Bearer` inválido, firma inválida, token expirado (`exp`), o `x-api-key` inválida/inactiva | `401 Unauthorized` |
| Token válido sin el `role` o `scope` requerido por la ruta | `403 Forbidden` |
| Error de negocio retornado por `auth-service` (`400`, `401`, `404`, `409`, etc.) | Mismo código HTTP y payload JSON de `auth-service` |
| Auth Service caído o inaccesible | `503 Service Unavailable` |
| Timeout (`> AUTH_TIMEOUT_MS`, por defecto `5000 ms`) | `504 Gateway Timeout` |




