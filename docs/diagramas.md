# Diagramas del sistema

Estos diagramas están escritos en **Mermaid**. GitHub los dibuja automáticamente al abrir este archivo.
En VS Code puedes verlos instalando la extensión *Markdown Preview Mermaid Support* y abriendo la vista previa (`Ctrl+Shift+V`).

## 1. Casos de uso

```mermaid
flowchart LR
    EST((Estudiante))
    ADM((Administrador))

    subgraph sis [Sistema de Control de Asistencia]
        UC1[Ingresar con correo o nro. de registro]
        UC2[Marcar asistencia del día]
        UC3[Ver historial y resumen personal]
        UC4[Ingresar con usuario y contraseña]
        UC5[Ver lista de estudiantes y buscar]
        UC6[Ver asistencias con filtros y totales]
        UC7[Modificar asistencia Presente/Falta]
        UC8[Ver historial de actividades]
        UC9[Importar Excel de estudiantes y fechas]
        UC10[Activar nuevo módulo]
        UC11[Exportar asistencias a Excel]
    end

    EST --> UC1 & UC2 & UC3
    ADM --> UC4 & UC5 & UC6 & UC7 & UC8 & UC9 & UC10 & UC11
    UC9 -. vista previa antes de .-> UC10
```

## 2. Modelo de datos (entidad–relación)

```mermaid
erDiagram
    MODULOS ||--o{ ESTUDIANTES : tiene
    MODULOS ||--o{ FECHAS_CLASE : tiene
    MODULOS ||--o{ ACTIVIDADES : registra
    ESTUDIANTES ||--o{ ASISTENCIAS : marca
    FECHAS_CLASE ||--o{ ASISTENCIAS : "se marca en"
    ESTUDIANTES ||--o{ AUDITORIA_ASISTENCIA : "cambios de"
    FECHAS_CLASE ||--o{ AUDITORIA_ASISTENCIA : "cambios en"

    ADMINISTRADORES {
        int id PK
        text usuario UK
        text password_hash
        text nombre
    }
    MODULOS {
        int id PK
        text nombre
        int activo "solo uno = 1"
        text creado_en
        text creado_por
    }
    ESTUDIANTES {
        int id PK
        int modulo_id FK
        text nro_registro "único por módulo"
        text nombre
        text correo "único por módulo"
    }
    FECHAS_CLASE {
        int id PK
        int modulo_id FK
        text fecha "AAAA-MM-DD"
        text hora_inicio
        text hora_fin
    }
    ASISTENCIAS {
        int id PK
        int estudiante_id FK
        int fecha_clase_id FK
        text estado "PRESENTE | FALTA"
        text marcado_en "hora real de la marca"
        text origen "ESTUDIANTE | ADMIN"
    }
    AUDITORIA_ASISTENCIA {
        int id PK
        int estudiante_id FK
        int fecha_clase_id FK
        text valor_anterior
        text valor_nuevo
        text usuario
        text creado_en
    }
    ACTIVIDADES {
        int id PK
        int modulo_id FK
        text usuario
        text rol
        text accion
        text detalle
        int estudiante_id FK
        text creado_en
    }
```

> La **falta** no se guarda como fila: si una fecha ya pasó y el estudiante no tiene registro, el sistema la muestra como Falta (RN-05). Solo se guarda una fila FALTA cuando el administrador la pone a mano.

## 3. Flujo: el estudiante marca asistencia

```mermaid
flowchart TD
    A[Estudiante ingresa correo o nro. de registro] --> B{¿Está en el módulo activo?}
    B -- No --> B1[Mensaje de error]
    B -- Sí --> C[Pantalla Mi asistencia]
    C --> D{¿Hoy es fecha de clase?}
    D -- No --> D1[Botón deshabilitado]
    D -- Sí --> E{¿Ya tiene registro hoy?}
    E -- Sí --> E1[Muestra Presente y la hora]
    E -- No --> F[Clic en Marcar asistencia]
    F --> G[Guarda PRESENTE con fecha y hora reales]
    G --> H[Registra actividad MARCA_ASISTENCIA]
```

## 4. Flujo: el administrador activa un nuevo módulo

```mermaid
sequenceDiagram
    actor Admin
    participant Web as Pantalla admin
    participant API as Servidor (Express)
    participant BD as SQLite

    Admin->>Web: Sube estudiantes.xlsx y fechas.xlsx
    Web->>API: POST /api/admin/modulo/previsualizar
    API->>API: Lee y valida (obligatorios, duplicados, formatos)
    alt Hay errores
        API-->>Web: Lista de errores por fila
    else Todo correcto
        API-->>Web: Vista previa
        Admin->>Web: Escribe nombre y confirma
        Web->>API: POST /api/admin/modulo/activar
        API->>BD: BEGIN
        API->>BD: Desactiva módulo anterior (no lo borra)
        API->>BD: Crea módulo, estudiantes y fechas
        API->>BD: Registra actividad ACTIVA_MODULO
        API->>BD: COMMIT
        API-->>Web: OK, nuevo módulo sin asistencias
    end
```

## 5. Arquitectura

```mermaid
flowchart LR
    subgraph nav [Navegador]
        P1[index.html - Login]
        P2[estudiante.html]
        P3[admin.html]
    end
    subgraph srv [Servidor Node.js]
        R1[routes/auth.js]
        R2[routes/estudiante.js]
        R3[routes/admin.js]
        S1[services/excel.js]
        S2[services/modulo.js]
        S3[services/fechas.js]
    end
    DB[(data/asistencia.db<br/>SQLite)]

    P1 -- fetch /api/auth --> R1
    P2 -- fetch /api/estudiante --> R2
    P3 -- fetch /api/admin --> R3
    R3 --> S1
    R1 & R2 & R3 --> S2 --> DB
    S2 --> S3
```
