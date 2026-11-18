# HardwareGuru - API Gateway & BFF

API Gateway y Backend-For-Frontend (BFF) desarrollado con **NestJS** para el ecosistema **HardwareGuru**. Actúa como el punto de entrada unificado para el cliente Frontend (React), orquestando las llamadas a los microservicios del backend mediante **gRPC** y **HTTP**, aplicando validación, observabilidad y transformación de datos.

---

## 1. Arquitectura del Sistema

```text
+-----------------------------------------------------------------------+
|                           Frontend (React)                            |
+-----------------------------------+-----------------------------------+
                                    |
                                    | HTTP / REST (JSON)
                                    | - Prefijo global: /api
                                    | - CORS habilitado
                                    v
+-----------------------------------------------------------------------+
|                       API Gateway / BFF (NestJS)                      |
|  - Deserialización nativa de JSON (specs y benchmarks)                |
|  - Validación de DTOs (ValidationPipe + class-validator)              |
|  - Normalización camelCase <-> snake_case                             |
|  - Orquestación IDs -> métricas vía Catálogo antes de simular         |
|  - Deadlines gRPC (3000 ms) y mapeo a HTTP (400, 404, 501-504)        |
|  - Telemetría y tracing con NestJS Observe                            |
+------------------+---------------------------------+------------------+
                   |                                 |
                   | gRPC (:50051)                   | gRPC (:9090)
                   | Contrato: hardware.proto        | Contrato: simulator.proto
                   v                                 v
+----------------------------------+  +----------------------------------+
|  Microservicio Catálogo (Go)     |  |  Microservicio Simulador (Java)  |
|  - Servicio: CatalogoService     |  |  - Servicio: SimulatorService    |
|  - Base de Datos: PostgreSQL     |  |  - Base de Datos: PostgreSQL     |
|  - Reglas de compatibilidad      |  |  - Consumo, cuello de botella    |
+----------------------------------+  +----------------------------------+
```

---

## 2. Estructura del Proyecto

```text
hardwareguru-api-gateway/
├── src/
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
│   ├── common/
│   │   └── proto/
│   │       ├── hardware.proto          # Contrato Protobuf compartido de catálogo
│   │       └── simulator.proto         # Contrato Protobuf compartido de simulador
│   ├── alerts/                         # Módulo preparado para microservicio de alertas
│   ├── chat/                           # Módulo preparado para microservicio de chat / IA
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
- **Microservicio de Catálogo en ejecución**: Servicio Go levantado en el puerto `50051` (vía `docker compose up -d` en `hardwareguru-catalogo`).
- **Microservicio Simulador en ejecución**: Servicio Spring Boot gRPC levantado en el puerto `9090` (`hardwareguru-simulador` / `SimulatorService`).

### Paso 1: Configurar Variables de Entorno
Copia el archivo de plantilla `.env.example` a `.env`:

```bash
cp .env.example .env
```

Configuración requerida en `.env`:
```env
PORT=3000
NODE_ENV=development

# Clientes gRPC
CATALOGO_GRPC_URL=localhost:50051
SIMULADOR_GRPC_URL=localhost:9090

# Kafka
KAFKA_BROKERS=localhost:9092
KAFKA_CLIENT_ID=api-gateway-producer

# Microservicios HTTP
ALERTS_SERVICE_URL=http://localhost:5001
MCP_SERVICE_URL=http://localhost:3001
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

Expone el RPC `GuardarBuild` definido en `simulator.proto`.

- **Método:** `POST`
- **Ruta:** `/api/simulador/builds`
- **Estado actual en el microservicio Simulador:** El RPC `GuardarBuild` está declarado en `simulator.proto` pero pendiente de implementación en `SimulatorServiceImpl`, por lo que al invocarlo actualmente el Gateway responderá `501 Not Implemented` (mapeado desde gRPC `UNIMPLEMENTED`).

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



