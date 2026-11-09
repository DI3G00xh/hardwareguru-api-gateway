# HardwareGuru - API Gateway & BFF

API Gateway y Backend-For-Frontend (BFF) desarrollado con **NestJS** para el ecosistema **HardwareGuru**. Actúa como el punto de entrada unificado para el cliente Frontend (React), orquestando las llamadas a los microservicios del backend mediante **gRPC** y **HTTP**, aplicando validación, observabilidad y transformación de datos.

---

## 1. Arquitectura del Sistema

```text
+-------------------------------------------------------------+
|                      Frontend (React)                       |
+------------------------------+------------------------------+
                               |
                               | HTTP / REST (JSON)
                               | - Prefijo global: /api
                               | - CORS habilitado
                               v
+-------------------------------------------------------------+
|                  API Gateway / BFF (NestJS)                 |
|  - Deserialización nativa de JSON (specs y benchmarks)      |
|  - Validación de DTOs (ValidationPipe + class-validator)    |
|  - Normalización camelCase <-> snake_case                   |
|  - Mapeo de errores gRPC a excepciones HTTP (400, 404, 500) |
|  - Telemetría y tracing con NestJS Observe                  |
+------------------------------+------------------------------+
                               |
                               | gRPC sobre HTTP/2 (Puerto :50051)
                               | Contrato: hardware.proto
                               v
+-------------------------------------------------------------+
|             Microservicio de Catálogo (Go 1.22+)            |
|  - Servicio gRPC: CatalogoService                           |
|  - Base de Datos: PostgreSQL                                |
|  - Validación de reglas de compatibilidad de hardware       |
+-------------------------------------------------------------+
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
│   ├── common/
│   │   └── proto/
│   │       └── hardware.proto          # Contratos Protobuf compartidos
│   ├── simulador/                      # Módulo preparado para microservicio de simulación
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
SIMULADOR_GRPC_URL=localhost:50052

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


