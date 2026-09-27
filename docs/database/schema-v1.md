# Agenda Local OS - Step 4: contrato de datos v1

**Estado:** propuesta técnica completa para revisión; NO es una migración ejecutada.
**Proyecto objetivo:** agenda-local-os-dev (idmkambczhdhvspbrdci).
**Alcance:** Core + Healthcare, entidades, tipos, claves, índices, permisos y plan de implementación.
**Fecha del hito:** 26 de septiembre de 2026, hora de México.

## 1. Base del trabajo y límites

El Master Prompt suministrado por José exige multi-tenancy desde la primera migración, RLS, separación CRM/clínico y aprobación profesional de salidas IA [S1]. El Step 4 pide literalmente: "Core and healthcare entities, keys, indexes and organization_id strategy documented/migrated" [S2]. El Step 5 implementa organizaciones, membresías y roles. Por eso esta entrega define el contrato completo; no ejecuta todavía las migraciones ni habilita módulos posteriores. Esta es una interpretación operativa explícita del orden del tablero, no un cambio del criterio.

Inspección de solo lectura realizada con Supabase.list_projects, list_tables(public, verbose=true) y list_migrations: proyecto correcto activo; public sin tablas; sin migraciones registradas. No significa que los esquemas gestionados auth/storage estén vacíos. No se leyeron filas de pacientes ni se modificaron datos.

Las entidades marcadas Master Prompt provienen del alcance solicitado. Los campos, tipos, claves, índices, estados técnicos adicionales y tablas marcadas Propuesta técnica son decisiones de diseño de esta entrega; no se presentan como decisiones previamente aprobadas. El inventario de código local no fue inspeccionado: este Step no cambia archivos de la app.

## 2. Convenciones comunes

- PostgreSQL 17 del proyecto; identificadores en snake_case, tablas plurales y UUID gen_random_uuid() para nuevas entidades. auth.users ya pertenece a Supabase y NO se crea otra tabla de passwords.
- Una fila tenant lleva id UUID PK y organization_id UUID NOT NULL con FK a organizations.id. organizations es la raíz, y profiles pertenece al usuario global: estas son excepciones explícitas, no organization_id nulos generalizados.
- Todas las relaciones de negocio incluyen organization_id. Una FK de solo contact_id, patient_id o member_id no es suficiente como contrato multitenant. Cada destino referenciado tiene la UNIQUE compuesta que necesita su FK [T2].
- created_at/updated_at son timestamptz, asignados y mantenidos por base de datos. Eventos append-only no necesitan updated_at. Timestamps de citas se muestran usando organizations.timezone. Fechas civiles como nacimiento usan date.
- En la notación de campos, ? significa nullable; los demás campos específicos son NOT NULL salvo referencia externa expresamente opcional. Valores por defecto aparecen tras =. Los identificadores de referencia pueden ser NULL cuando su relación sea opcional, pero organization_id nunca.
- Dinero numeric(14,2), cantidades numeric(10,2), moneda por organización/plan/presupuesto. Un presupuesto conserva snapshot de precios y descripción; no se recalcula con precios actuales de services.
- Los estados se modelan con text + CHECK de valores permitidos. No todo cambio de estado válido es una transición autorizada: las transiciones requieren operaciones específicas.
- JSONB se limita a contenido configurable validado y metadata permitida. Los vínculos a entidades no se esconden en JSON. Las plantillas clínicas tienen versión explícita.
- UNIQUE crea su índice de soporte. Los índices de FK en el lado hijo no aparecen automáticamente: se diseña cobertura para cada relación y se evita duplicar índices equivalentes [T2]. Los índices listados aquí son candidatos según consultas previstas, no mediciones de rendimiento.

## 3. Integridad multitenant y de paciente

Toda referencia tenant utiliza (organization_id, foreign_id) -> (organization_id,id). Cuando dos registros deben ser también del mismo paciente o contacto, se agrega esa dimensión. Ejemplos de contrato, NO instrucciones para ejecutar solas:

```sql
-- Un lead solo puede usar contactos de su organizacion.
FOREIGN KEY (organization_id, contact_id)
  REFERENCES public.contacts (organization_id, id);

-- Una nota solo puede pertenecer a un encuentro del MISMO paciente.
FOREIGN KEY (organization_id, patient_id, encounter_id)
  REFERENCES public.clinical_encounters (organization_id, patient_id, id);
```

Proteger también las relaciones indirectas: cita/contacto/paciente, presupuesto/plan/item y análisis IA/imagen/paciente. Una FK simple solo al tenant no detecta todos los cruces entre pacientes de la misma clínica. Los campos de identidad y tenant serán inmutables mediante privilegios por columna y/o triggers; compartir acceso a dos organizaciones no autoriza trasladar registros entre ellas.

Relación opcional: MATCH SIMPLE permite omitir una FK compuesta si uno de sus componentes es NULL. Por ello los campos de contexto necesarios son NOT NULL o tienen CHECK de dependencia. Por ejemplo, metrics_events.lead_id exige contact_id, y quote_items.plan_item_id exige plan_id. No usar CHECK con subconsultas para reglas entre filas: se necesitan FK, índices, funciones o triggers [T2].

## 4. Autorización prevista (todavía no implementada)

RLS + GRANT + autorización del servidor forman controles distintos. Cada migración que cree una tabla expuesta incluirá inmediatamente ENABLE ROW LEVEL SECURITY, revocación de privilegios innecesarios y grants mínimos. Mientras no existan policies aprobadas se mantiene denegación por defecto; nunca usar USING(true) para "hacer funcionar" el CRM [T1].

Se mantendrá public para compatibilidad con el cliente actual; el nombre public NO autoriza acceso anónimo. Clínica separada por tablas y por permisos, no por cosmética en el frontend. Funciones auxiliares de permisos se ubicarán en private, no expuesto, con search_path controlado, parámetros validados y EXECUTE restringido. No usar service_role como cliente habitual de peticiones de usuarios [T1].

| Actor | CRM administrativo | Expediente/RX | Firmar nota | Roles y permisos |
|---|---|---|---|---|
| No autenticado o no miembro | No | No | No | No |
| Member activo | Según acciones habilitadas | No por defecto | No | No |
| Owner/Admin comercial | Gestión comercial | No por defecto | No por defecto | Comercial; no auto-conceder acceso clínico |
| Doctor/Dentist | Según permiso | Con permiso explícito y alcance de pacientes | Con clinical.approve y alcance | No automáticamente |
| Clinical assistant | Según permiso | Solo concesiones específicas | No por defecto | No |
| Reception | Agenda/CRM | No por defecto | No | No |

clinical_role identifica el perfil; member_permissions concede operaciones; patient_care_team limita a pacientes asignados salvo clinical_scope=organization explícitamente autorizado. En todos los casos se exige membership activo, tenant correcto y healthcare_enabled. Una suspensión debe surtir efecto al consultar membresía actual, no depender solo de claims antiguos. No aceptar rol/organization_id de user_metadata como autoridad.

Para activar por primera vez el responsable clínico se requiere un flujo separado, con decisión explícita y auditada de José antes de datos reales. No se inventa aquí una validación de cédula ni se presume que el rol técnico acredite una profesión.

Presupuestos clínicos se consideran sensibles: nombres de tratamientos pueden revelar información de salud. Reception no obtiene automáticamente quotes/quote_items por estar en CRM. Una futura vista administrativa de importes necesitará permiso quotes.read y una proyección sin diagnósticos; no se expone toda la tabla para resolverlo.

## 5. Diccionario de entidades

Los campos comunes se agregan a los específicos de cada entidad. Los nombres auth.users y storage.objects pertenecen a Supabase; no forman parte de las nuevas tablas. Los índices de consulta indicados se suman a PK, UNIQUE y cobertura de las FK. WHERE status = pending en la notación significa el literal SQL 'pending'.


### 01 Identidad y organizaciones


#### `profiles`

**Origen de la entidad:** Propuesta técnica. **Alcance:** user.

**Campos:** `user_id:uuid PK/FK auth.users.id`; `display_name:text`; `locale:text=es-MX`; `created_at:timestamptz`; `updated_at:timestamptz`.

**Reglas:** Perfil personal del usuario, sin roles ni datos de negocio. Lectura/escritura propia. No replicar password ni tokens de Auth.

**Índices de consulta:** `PK(user_id)`.


#### `organizations`

**Origen de la entidad:** Master Prompt. **Alcance:** organization.

**Comunes:** `id:uuid PK default gen_random_uuid()`; `created_at:timestamptz default now()`; `updated_at:timestamptz default now()`.

**Campos:** `name:text`; `slug:text`; `industry:text=general`; `timezone:text=America/Mexico_City`; `currency:char(3)=MXN`; `healthcare_enabled:boolean=false`; `clinical_ai_enabled:boolean=false`; `status:text=active`; `created_by_user_id:uuid FK auth.users.id`.

**Reglas:** UNIQUE(slug). industry: general/dental/medical; healthcare_enabled implica dental o medical; clinical_ai_enabled implica healthcare_enabled. status: active/suspended/archived. El id de esta fila es el tenant; no lleva organization_id a si misma.

**Índices de consulta:** `UNIQUE(slug)`.


#### `organization_members`

**Origen de la entidad:** Master Prompt. **Alcance:** tenant.

**Comunes:** `id:uuid PK default gen_random_uuid()`; `created_at:timestamptz default now()`; `organization_id:uuid NOT NULL FK organizations.id ON DELETE RESTRICT`; `updated_at:timestamptz default now()`.

**Campos:** `user_id:uuid FK auth.users.id`; `role:text=member`; `clinical_role:text?`; `clinical_scope:text=assigned`; `status:text=active`; `joined_at:timestamptz`.

**Reglas:** UNIQUE(organization_id,user_id). role: owner/admin/member. clinical_role: doctor/dentist/clinical_assistant/reception o NULL. clinical_scope: assigned/organization. Cambios de rol/alcance solo por operación autorizada; nunca UPDATE libre ni user_metadata. No eliminar al último owner activo; suspender sin borrar autoría.

**Claves destino de FK:** `UNIQUE(organization_id,id)`.

**Índices de consulta:** `(user_id,status,organization_id)`.


#### `business_profiles`

**Origen de la entidad:** Master Prompt. **Alcance:** tenant.

**Comunes:** `id:uuid PK default gen_random_uuid()`; `created_at:timestamptz default now()`; `organization_id:uuid NOT NULL FK organizations.id ON DELETE RESTRICT`; `updated_at:timestamptz default now()`.

**Campos:** `city:text?`; `ideal_customer:text?`; `whatsapp_phone:text?`; `tone:text?`; `primary_goal:text?`; `onboarding_step:smallint=0`; `onboarding_completed_at:timestamptz?`.

**Reglas:** UNIQUE(organization_id). onboarding_step entre 0 y 9. Nombre/industria se leen de organizations; servicios y precios se leen de services. No duplicarlos en arrays mutables.

**Claves destino de FK:** `UNIQUE(organization_id,id)`.

**Índices de consulta:** `UNIQUE(organization_id)`.


#### `services`

**Origen de la entidad:** Propuesta técnica. **Alcance:** tenant.

**Comunes:** `id:uuid PK default gen_random_uuid()`; `created_at:timestamptz default now()`; `organization_id:uuid NOT NULL FK organizations.id ON DELETE RESTRICT`; `updated_at:timestamptz default now()`.

**Campos:** `code:text`; `name:text`; `description:text?`; `price:numeric(14,2)=0`; `duration_minutes:integer?`; `active:boolean=true`.

**Reglas:** UNIQUE(organization_id,code). price >= 0; duration_minutes > 0 si existe. Moneda heredada de organization. Un precio histórico en un presupuesto no cambia al editar el catálogo.

**Claves destino de FK:** `UNIQUE(organization_id,id)`.

**Índices de consulta:** `(organization_id,active,name)`.


#### `member_permissions`

**Origen de la entidad:** Propuesta técnica. **Alcance:** tenant.

**Comunes:** `id:uuid PK default gen_random_uuid()`; `created_at:timestamptz default now()`; `organization_id:uuid NOT NULL FK organizations.id ON DELETE RESTRICT`; `updated_at:timestamptz default now()`.

**Campos:** `member_id:uuid`; `permission:text`; `granted_by_member_id:uuid?`; `grant_source:text`; `revoked_at:timestamptz?`.

**Reglas:** Una concesión activa por miembro/permission, mediante índice UNIQUE parcial WHERE revoked_at IS NULL. permission pertenece a catálogo cerrado: clinical.read/write/approve/files.read/files.write/ai.request/access.manage, quotes.read/write/discount, audit.read. grant_source: system/human; human exige granted_by. Cambios auditados y sujetos a autorización distinta de owner/admin comercial.

**Claves destino de FK:** `UNIQUE(organization_id,id)`.

**Relaciones:** `(organization_id,member_id) -> organization_members(organization_id,id)`; `(organization_id,granted_by_member_id) -> organization_members(organization_id,id)`.

**Índices de consulta:** `(organization_id,member_id,permission) WHERE revoked_at IS NULL`.


#### `patient_care_team`

**Origen de la entidad:** Propuesta técnica. **Alcance:** tenant.

**Comunes:** `id:uuid PK default gen_random_uuid()`; `created_at:timestamptz default now()`; `organization_id:uuid NOT NULL FK organizations.id ON DELETE RESTRICT`; `updated_at:timestamptz default now()`.

**Campos:** `patient_id:uuid`; `member_id:uuid`; `granted_by_member_id:uuid?`; `active:boolean=true`.

**Reglas:** UNIQUE(organization_id,patient_id,member_id). Es alcance de pacientes, no permiso por si solo. Acceso requiere además membership activo y permiso clínico. Un usuario con clinical_scope=assigned necesita esta asignacion activa.

**Claves destino de FK:** `UNIQUE(organization_id,id)`.

**Relaciones:** `(organization_id,patient_id) -> patients(organization_id,id)`; `(organization_id,member_id) -> organization_members(organization_id,id)`; `(organization_id,granted_by_member_id) -> organization_members(organization_id,id)`.

**Índices de consulta:** `(organization_id,member_id,active,patient_id)`.


### 02 CRM y agenda


#### `contacts`

**Origen de la entidad:** Master Prompt. **Alcance:** tenant.

**Comunes:** `id:uuid PK default gen_random_uuid()`; `created_at:timestamptz default now()`; `organization_id:uuid NOT NULL FK organizations.id ON DELETE RESTRICT`; `updated_at:timestamptz default now()`.

**Campos:** `display_name:text`; `email:text?`; `phone:text?`; `source:text?`; `customer_since:timestamptz?`; `archived_at:timestamptz?`.

**Reglas:** Nombre no vacío. email/phone no son UNIQUE globales ni por tenant: pueden compartirse. No almacenar diagnósticos ni notas clínicas. Cliente se identifica por customer_since; no se crea otra tabla clients para duplicar identidad.

**Claves destino de FK:** `UNIQUE(organization_id,id)`.

**Índices de consulta:** `(organization_id,created_at DESC,id); (organization_id,lower(email)); (organization_id,phone)`.


#### `pipeline_stages`

**Origen de la entidad:** Master Prompt. **Alcance:** tenant.

**Comunes:** `id:uuid PK default gen_random_uuid()`; `created_at:timestamptz default now()`; `organization_id:uuid NOT NULL FK organizations.id ON DELETE RESTRICT`; `updated_at:timestamptz default now()`.

**Campos:** `stage_key:text`; `name:text`; `position:integer`; `active:boolean=true`.

**Reglas:** UNIQUE(organization_id,stage_key), UNIQUE(organization_id,position) DEFERRABLE. Ocho etapas iniciales: Nuevo, Contactado, Interesado, Cita propuesta, Cita agendada, Cliente, Seguimiento, Perdido. Reordenar dentro de una transacción.

**Claves destino de FK:** `UNIQUE(organization_id,id)`.

**Índices de consulta:** `(organization_id,position)`.


#### `leads`

**Origen de la entidad:** Master Prompt. **Alcance:** tenant.

**Comunes:** `id:uuid PK default gen_random_uuid()`; `created_at:timestamptz default now()`; `organization_id:uuid NOT NULL FK organizations.id ON DELETE RESTRICT`; `updated_at:timestamptz default now()`.

**Campos:** `contact_id:uuid`; `stage_id:uuid`; `service_id:uuid?`; `assigned_member_id:uuid?`; `title:text`; `source:text?`; `estimated_value:numeric(14,2)=0`; `status:text=open`; `converted_at:timestamptz?`; `closed_at:timestamptz?`.

**Reglas:** status: open/won/lost. estimated_value >= 0. Una persona puede tener varias oportunidades. Cambio de etapa, conversión y registro en activities deben ser atómicos. Pasar a Seguimiento no debe deshacer customer_since; la conversión es un evento explícito.

**Claves destino de FK:** `UNIQUE(organization_id,id)`; `UNIQUE(organization_id,contact_id,id)`.

**Relaciones:** `(organization_id,contact_id) -> contacts(organization_id,id)`; `(organization_id,stage_id) -> pipeline_stages(organization_id,id)`; `(organization_id,service_id) -> services(organization_id,id)`; `(organization_id,assigned_member_id) -> organization_members(organization_id,id)`.

**Índices de consulta:** `(organization_id,stage_id,created_at DESC,id); (organization_id,contact_id,id); (organization_id,assigned_member_id,status)`.


#### `activities`

**Origen de la entidad:** Master Prompt. **Alcance:** tenant.

**Comunes:** `id:uuid PK default gen_random_uuid()`; `created_at:timestamptz default now()`; `organization_id:uuid NOT NULL FK organizations.id ON DELETE RESTRICT`.

**Campos:** `contact_id:uuid`; `lead_id:uuid?`; `actor_member_id:uuid?`; `kind:text`; `body:text?`; `metadata:jsonb={}`; `occurred_at:timestamptz`.

**Reglas:** kind: administrative_note/call/message/stage_change/conversión. Solo contexto administrativo; metadata con lista de campos permitidos. Timeline append-only; correcciones como evento nuevo. Lead opcional debe pertenecer al MISMO contacto.

**Claves destino de FK:** `UNIQUE(organization_id,id)`.

**Relaciones:** `(organization_id,contact_id) -> contacts(organization_id,id)`; `(organization_id,contact_id,lead_id) -> leads(organization_id,contact_id,id)`; `(organization_id,actor_member_id) -> organization_members(organization_id,id)`.

**Índices de consulta:** `(organization_id,contact_id,occurred_at DESC,id)`.


#### `followups`

**Origen de la entidad:** Master Prompt. **Alcance:** tenant.

**Comunes:** `id:uuid PK default gen_random_uuid()`; `created_at:timestamptz default now()`; `organization_id:uuid NOT NULL FK organizations.id ON DELETE RESTRICT`; `updated_at:timestamptz default now()`.

**Campos:** `contact_id:uuid`; `lead_id:uuid?`; `assigned_member_id:uuid?`; `due_at:timestamptz`; `status:text=pending`; `result:text?`; `completed_at:timestamptz?`.

**Reglas:** status: pending/completed/cancelled. completed exige completed_at y resultado. Vencidos/Hoy/Mañana son filtros calculados con timezone del negocio, no estados adicionales.

**Claves destino de FK:** `UNIQUE(organization_id,id)`.

**Relaciones:** `(organization_id,contact_id) -> contacts(organization_id,id)`; `(organization_id,contact_id,lead_id) -> leads(organization_id,contact_id,id)`; `(organization_id,assigned_member_id) -> organization_members(organization_id,id)`.

**Índices de consulta:** `(organization_id,due_at,id) WHERE status = pending; (organization_id,contact_id,id)`.


#### `appointments`

**Origen de la entidad:** Master Prompt. **Alcance:** tenant.

**Comunes:** `id:uuid PK default gen_random_uuid()`; `created_at:timestamptz default now()`; `organization_id:uuid NOT NULL FK organizations.id ON DELETE RESTRICT`; `updated_at:timestamptz default now()`.

**Campos:** `contact_id:uuid`; `lead_id:uuid?`; `assigned_member_id:uuid?`; `service_id:uuid?`; `starts_at:timestamptz`; `ends_at:timestamptz`; `status:text=scheduled`; `administrative_note:text?`.

**Reglas:** ends_at > starts_at. status: scheduled/confirmed/completed/cancelled/no_show. Relación con lead mantiene contacto. Solapamientos de recursos se resolverán en el módulo de citas; no se presume que todos los negocios tengan la misma política.

**Claves destino de FK:** `UNIQUE(organization_id,id)`; `UNIQUE(organization_id,contact_id,id)`.

**Relaciones:** `(organization_id,contact_id) -> contacts(organization_id,id)`; `(organization_id,contact_id,lead_id) -> leads(organization_id,contact_id,id)`; `(organization_id,assigned_member_id) -> organization_members(organization_id,id)`; `(organization_id,service_id) -> services(organization_id,id)`.

**Índices de consulta:** `(organization_id,starts_at,id); (organization_id,contact_id,starts_at DESC); (organization_id,assigned_member_id,starts_at)`.


#### `communication_preferences`

**Origen de la entidad:** Propuesta técnica. **Alcance:** tenant.

**Comunes:** `id:uuid PK default gen_random_uuid()`; `created_at:timestamptz default now()`; `organization_id:uuid NOT NULL FK organizations.id ON DELETE RESTRICT`; `updated_at:timestamptz default now()`.

**Campos:** `contact_id:uuid`; `channel:text`; `preference:text=unknown`; `source:text`; `recorded_at:timestamptz`.

**Reglas:** UNIQUE(organization_id,contact_id,channel). channel: email/whatsapp/sms/phone. preference: unknown/opted_in/opted_out. No asumir consentimiento por existir un contacto. Registrar evidencia de cambios; validación jurídica por canal pendiente, no se afirma cumplimiento legal.

**Claves destino de FK:** `UNIQUE(organization_id,id)`.

**Relaciones:** `(organization_id,contact_id) -> contacts(organization_id,id)`.

**Índices de consulta:** `UNIQUE(organization_id,contact_id,channel)`.


### 03 Marketing y bibliotecas


#### `scripts`

**Origen de la entidad:** Master Prompt. **Alcance:** tenant.

**Comunes:** `id:uuid PK default gen_random_uuid()`; `created_at:timestamptz default now()`; `organization_id:uuid NOT NULL FK organizations.id ON DELETE RESTRICT`; `updated_at:timestamptz default now()`.

**Campos:** `title:text`; `category:text`; `body:text`; `variables:jsonb=[]`; `active:boolean=true`.

**Reglas:** variables es una lista validada de nombres, no SQL/código ejecutable. Contenido inicial se copia por tenant. No usar organization_id NULL para bibliotecas globales.

**Claves destino de FK:** `UNIQUE(organization_id,id)`.

**Índices de consulta:** `(organization_id,category,active)`.


#### `script_favorites`

**Origen de la entidad:** Propuesta técnica. **Alcance:** tenant.

**Comunes:** `id:uuid PK default gen_random_uuid()`; `created_at:timestamptz default now()`; `organization_id:uuid NOT NULL FK organizations.id ON DELETE RESTRICT`; `updated_at:timestamptz default now()`.

**Campos:** `member_id:uuid`; `script_id:uuid`.

**Reglas:** UNIQUE(organization_id,member_id,script_id). Favorito individual; no columna is_favorite compartida por toda la organización.

**Claves destino de FK:** `UNIQUE(organization_id,id)`.

**Relaciones:** `(organization_id,member_id) -> organization_members(organization_id,id)`; `(organization_id,script_id) -> scripts(organization_id,id)`.

**Índices de consulta:** `(organization_id,script_id)`.


#### `prompts`

**Origen de la entidad:** Master Prompt. **Alcance:** tenant.

**Comunes:** `id:uuid PK default gen_random_uuid()`; `created_at:timestamptz default now()`; `organization_id:uuid NOT NULL FK organizations.id ON DELETE RESTRICT`; `updated_at:timestamptz default now()`.

**Campos:** `title:text`; `category:text`; `body:text`; `variables:jsonb=[]`; `version:integer=1`; `active:boolean=true`.

**Reglas:** versión > 0. Categorias del Master Prompt: Marketing, Sales, Content, WhatsApp, Research, Offers, Ads, Customer Service, Productivity. Nunca incrustar secretos en el texto.

**Claves destino de FK:** `UNIQUE(organization_id,id)`.

**Índices de consulta:** `(organization_id,category,active)`.


#### `prompt_favorites`

**Origen de la entidad:** Propuesta técnica. **Alcance:** tenant.

**Comunes:** `id:uuid PK default gen_random_uuid()`; `created_at:timestamptz default now()`; `organization_id:uuid NOT NULL FK organizations.id ON DELETE RESTRICT`; `updated_at:timestamptz default now()`.

**Campos:** `member_id:uuid`; `prompt_id:uuid`.

**Reglas:** UNIQUE(organization_id,member_id,prompt_id). Propiedad de la preferencia individual.

**Claves destino de FK:** `UNIQUE(organization_id,id)`.

**Relaciones:** `(organization_id,member_id) -> organization_members(organization_id,id)`; `(organization_id,prompt_id) -> prompts(organization_id,id)`.

**Índices de consulta:** `(organization_id,prompt_id)`.


#### `campaigns`

**Origen de la entidad:** Master Prompt. **Alcance:** tenant.

**Comunes:** `id:uuid PK default gen_random_uuid()`; `created_at:timestamptz default now()`; `organization_id:uuid NOT NULL FK organizations.id ON DELETE RESTRICT`; `updated_at:timestamptz default now()`.

**Campos:** `name:text`; `objective:text`; `audience:text`; `offer:text`; `channel:text`; `initial_message:text?`; `cta:text?`; `followup_plan:jsonb=[]`; `kpi_definition:jsonb={}`; `status:text=draft`; `scheduled_at:timestamptz?`.

**Reglas:** status: draft/ready/active/completed/archived. Plan persistente no equivale a envio real. JSON con esquema y sin IDs de entidades que deban tener FK.

**Claves destino de FK:** `UNIQUE(organization_id,id)`.

**Índices de consulta:** `(organization_id,status,created_at DESC,id)`.


#### `content_items`

**Origen de la entidad:** Master Prompt. **Alcance:** tenant.

**Comunes:** `id:uuid PK default gen_random_uuid()`; `created_at:timestamptz default now()`; `organization_id:uuid NOT NULL FK organizations.id ON DELETE RESTRICT`; `updated_at:timestamptz default now()`.

**Campos:** `campaign_id:uuid?`; `channel:text`; `content_type:text`; `body:text`; `status:text=idea`; `planned_at:timestamptz?`; `published_at:timestamptz?`; `external_url:text?`.

**Reglas:** status: idea/pending/created/published. Publicado requiere confirmacion de publicación y published_at; no marcar publicado al generar texto IA.

**Claves destino de FK:** `UNIQUE(organization_id,id)`.

**Relaciones:** `(organization_id,campaign_id) -> campaigns(organization_id,id)`.

**Índices de consulta:** `(organization_id,planned_at,id); (organization_id,campaign_id,id)`.


#### `reviews`

**Origen de la entidad:** Master Prompt. **Alcance:** tenant.

**Comunes:** `id:uuid PK default gen_random_uuid()`; `created_at:timestamptz default now()`; `organization_id:uuid NOT NULL FK organizations.id ON DELETE RESTRICT`; `updated_at:timestamptz default now()`.

**Campos:** `contact_id:uuid`; `appointment_id:uuid?`; `status:text=pending`; `request_message:text?`; `requested_at:timestamptz?`; `received_at:timestamptz?`; `external_url:text?`.

**Reglas:** status: pending/requested/received. Appointment debe corresponder al contacto. Registrar una solicitud no demuestra que se haya publicado una reseña.

**Claves destino de FK:** `UNIQUE(organization_id,id)`.

**Relaciones:** `(organization_id,contact_id) -> contacts(organization_id,id)`; `(organization_id,contact_id,appointment_id) -> appointments(organization_id,contact_id,id)`.

**Índices de consulta:** `(organization_id,status,created_at DESC); (organization_id,contact_id,id)`.


#### `reactivation_campaigns`

**Origen de la entidad:** Master Prompt. **Alcance:** tenant.

**Comunes:** `id:uuid PK default gen_random_uuid()`; `created_at:timestamptz default now()`; `organization_id:uuid NOT NULL FK organizations.id ON DELETE RESTRICT`; `updated_at:timestamptz default now()`.

**Campos:** `name:text`; `inactivity_days:integer`; `channel:text`; `message_template:text`; `segment_snapshot_at:timestamptz?`; `status:text=draft`.

**Reglas:** inactivity_days IN (30,60,90,180,365). status: draft/ready/active/completed/archived. Definir actividad comercial elegible sin consultar contenido clínico.

**Claves destino de FK:** `UNIQUE(organization_id,id)`.

**Índices de consulta:** `(organization_id,status,created_at DESC)`.


#### `reactivation_recipients`

**Origen de la entidad:** Propuesta técnica. **Alcance:** tenant.

**Comunes:** `id:uuid PK default gen_random_uuid()`; `created_at:timestamptz default now()`; `organization_id:uuid NOT NULL FK organizations.id ON DELETE RESTRICT`; `updated_at:timestamptz default now()`.

**Campos:** `reactivation_campaign_id:uuid`; `contact_id:uuid`; `status:text=pending`; `last_activity_at:timestamptz?`; `message_snapshot:text?`; `contacted_at:timestamptz?`; `reactivated_at:timestamptz?`.

**Reglas:** UNIQUE(organization_id,reactivation_campaign_id,contact_id). status: pending/contacted/reactivated/excluded. Volver a comprobar preferencias antes de enviar. La captura de segmento evita que la lista cambie silenciosamente.

**Claves destino de FK:** `UNIQUE(organization_id,id)`.

**Relaciones:** `(organization_id,reactivation_campaign_id) -> reactivation_campaigns(organization_id,id)`; `(organization_id,contact_id) -> contacts(organization_id,id)`.

**Índices de consulta:** `(organization_id,contact_id,id)`.


#### `sops`

**Origen de la entidad:** Master Prompt. **Alcance:** tenant.

**Comunes:** `id:uuid PK default gen_random_uuid()`; `created_at:timestamptz default now()`; `organization_id:uuid NOT NULL FK organizations.id ON DELETE RESTRICT`; `updated_at:timestamptz default now()`.

**Campos:** `slug:text`; `title:text`; `objective:text`; `duration_minutes:integer?`; `steps:jsonb=[]`; `checklist:jsonb=[]`; `script_examples:jsonb=[]`; `kpi_definition:jsonb={}`; `version:integer=1`.

**Reglas:** UNIQUE(organization_id,slug). JSON guarda contenido y ejemplos, no relaciones sin FK. Versión positiva; conservar versiones publicadas cuando sean consumidas.

**Claves destino de FK:** `UNIQUE(organization_id,id)`.

**Índices de consulta:** `(organization_id,title)`.


#### `courses`

**Origen de la entidad:** Master Prompt. **Alcance:** tenant.

**Comunes:** `id:uuid PK default gen_random_uuid()`; `created_at:timestamptz default now()`; `organization_id:uuid NOT NULL FK organizations.id ON DELETE RESTRICT`; `updated_at:timestamptz default now()`.

**Campos:** `slug:text`; `title:text`; `description:text?`; `status:text=draft`.

**Reglas:** UNIQUE(organization_id,slug). status: draft/published/archived. Distribución inicial mediante copia tenant de plantillas, no datos privados globales.

**Claves destino de FK:** `UNIQUE(organization_id,id)`.

**Índices de consulta:** `(organization_id,status)`.


#### `lessons`

**Origen de la entidad:** Master Prompt. **Alcance:** tenant.

**Comunes:** `id:uuid PK default gen_random_uuid()`; `created_at:timestamptz default now()`; `organization_id:uuid NOT NULL FK organizations.id ON DELETE RESTRICT`; `updated_at:timestamptz default now()`.

**Campos:** `course_id:uuid`; `title:text`; `position:integer`; `content:jsonb={}`; `duration_minutes:integer?`; `active:boolean=true`.

**Reglas:** UNIQUE(organization_id,course_id,position) DEFERRABLE. position >= 0; contenido validado y sanitizado en renderizado.

**Claves destino de FK:** `UNIQUE(organization_id,id)`.

**Relaciones:** `(organization_id,course_id) -> courses(organization_id,id)`.

**Índices de consulta:** `(organization_id,course_id,position)`.


#### `lesson_progress`

**Origen de la entidad:** Master Prompt. **Alcance:** tenant.

**Comunes:** `id:uuid PK default gen_random_uuid()`; `created_at:timestamptz default now()`; `organization_id:uuid NOT NULL FK organizations.id ON DELETE RESTRICT`; `updated_at:timestamptz default now()`.

**Campos:** `member_id:uuid`; `lesson_id:uuid`; `progress_percent:smallint=0`; `completed_at:timestamptz?`.

**Reglas:** UNIQUE(organization_id,member_id,lesson_id). Progreso entre 0 y 100; completed_at exige 100. Usuario actualiza solo su progreso autorizado.

**Claves destino de FK:** `UNIQUE(organization_id,id)`.

**Relaciones:** `(organization_id,member_id) -> organization_members(organization_id,id)`; `(organization_id,lesson_id) -> lessons(organization_id,id)`.

**Índices de consulta:** `(organization_id,lesson_id)`.


### 04 IA, métricas y auditoría


#### `ai_generations`

**Origen de la entidad:** Master Prompt. **Alcance:** tenant.

**Comunes:** `id:uuid PK default gen_random_uuid()`; `created_at:timestamptz default now()`; `organization_id:uuid NOT NULL FK organizations.id ON DELETE RESTRICT`; `updated_at:timestamptz default now()`.

**Campos:** `requested_by_member_id:uuid`; `operation:text`; `provider:text`; `model:text`; `prompt_version:text`; `status:text=pending`; `sanitized_input:jsonb={}`; `output:jsonb?`; `input_tokens:integer?`; `output_tokens:integer?`; `error_code:text?`; `finished_at:timestamptz?`.

**Reglas:** Solo IA comercial. status: pending/running/succeeded/failed/cancelled. No almacenar API keys ni contenido clínico. Tokens no negativos cuando se conozcan. Estado exitoso requiere resultado, no un mock silencioso.

**Claves destino de FK:** `UNIQUE(organization_id,id)`.

**Relaciones:** `(organization_id,requested_by_member_id) -> organization_members(organization_id,id)`.

**Índices de consulta:** `(organization_id,requested_by_member_id,created_at DESC,id)`.


#### `metrics_events`

**Origen de la entidad:** Master Prompt. **Alcance:** tenant.

**Comunes:** `id:uuid PK default gen_random_uuid()`; `created_at:timestamptz default now()`; `organization_id:uuid NOT NULL FK organizations.id ON DELETE RESTRICT`.

**Campos:** `event_name:text`; `contact_id:uuid?`; `lead_id:uuid?`; `actor_member_id:uuid?`; `occurred_at:timestamptz`; `idempotency_key:text`; `properties:jsonb={}`.

**Reglas:** UNIQUE(organization_id,idempotency_key). Append-only. Solo eventos administrativos validados; no clínicos. Si lead_id existe, contact_id debe existir y coincidir. Las métricas agregadas se calculan, no se inventan ni duplican como valores manuales.

**Claves destino de FK:** `UNIQUE(organization_id,id)`.

**Relaciones:** `(organization_id,contact_id) -> contacts(organization_id,id)`; `(organization_id,contact_id,lead_id) -> leads(organization_id,contact_id,id)`; `(organization_id,actor_member_id) -> organization_members(organization_id,id)`.

**Índices de consulta:** `(organization_id,event_name,occurred_at DESC,id)`.


#### `audit_events`

**Origen de la entidad:** Propuesta técnica. **Alcance:** tenant.

**Comunes:** `id:uuid PK default gen_random_uuid()`; `created_at:timestamptz default now()`; `organization_id:uuid NOT NULL FK organizations.id ON DELETE RESTRICT`.

**Campos:** `actor_member_id:uuid?`; `actor_kind:text`; `action:text`; `entity_type:text`; `entity_id:uuid?`; `occurred_at:timestamptz`; `safe_metadata:jsonb={}`.

**Reglas:** Append-only. actor_kind: member/system; miembro exige actor_member_id. entity_id es referencia historica intencional, no base de autorización ni FK polimórfica. Sin textos clínicos, passwords o tokens. Sin UPDATE/DELETE desde cliente.

**Claves destino de FK:** `UNIQUE(organization_id,id)`.

**Relaciones:** `(organization_id,actor_member_id) -> organization_members(organization_id,id)`.

**Índices de consulta:** `(organization_id,occurred_at DESC,id); (organization_id,entity_type,entity_id)`.


### 05 Expediente y atención clínica


#### `patients`

**Origen de la entidad:** Master Prompt. **Alcance:** tenant.

**Comunes:** `id:uuid PK default gen_random_uuid()`; `created_at:timestamptz default now()`; `organization_id:uuid NOT NULL FK organizations.id ON DELETE RESTRICT`; `updated_at:timestamptz default now()`.

**Campos:** `contact_id:uuid`; `record_number:text`; `birth_date:date?`; `demographic_data:jsonb={}`; `archived_at:timestamptz?`.

**Reglas:** UNIQUE(organization_id,contact_id), UNIQUE(organization_id,record_number). Contacto 0..1 paciente por organización. No duplicar teléfono/email/nombre. Demografía adicional permanece protegida en el contexto clínico.

**Claves destino de FK:** `UNIQUE(organization_id,id)`; `UNIQUE(organization_id,contact_id,id)`.

**Relaciones:** `(organization_id,contact_id) -> contacts(organization_id,id)`.

**Índices de consulta:** `(organization_id,record_number)`.


#### `clinical_templates`

**Origen de la entidad:** Master Prompt. **Alcance:** tenant.

**Comunes:** `id:uuid PK default gen_random_uuid()`; `created_at:timestamptz default now()`; `organization_id:uuid NOT NULL FK organizations.id ON DELETE RESTRICT`; `updated_at:timestamptz default now()`.

**Campos:** `template_key:text`; `kind:text`; `specialty:text`; `version:integer`; `definition:jsonb`; `active:boolean=true`.

**Reglas:** UNIQUE(organization_id,template_key,versión). kind: history/progress_note/consent. Versión > 0. La versión publicada/usada no se sobrescribe; una modificacion crea nueva versión.

**Claves destino de FK:** `UNIQUE(organization_id,id)`.

**Índices de consulta:** `(organization_id,kind,specialty,active)`.


#### `clinical_histories`

**Origen de la entidad:** Master Prompt. **Alcance:** tenant.

**Comunes:** `id:uuid PK default gen_random_uuid()`; `created_at:timestamptz default now()`; `organization_id:uuid NOT NULL FK organizations.id ON DELETE RESTRICT`; `updated_at:timestamptz default now()`.

**Campos:** `patient_id:uuid`; `template_id:uuid`; `version:integer`; `status:text=draft`; `supersedes_history_id:uuid?`; `authored_by_member_id:uuid`; `finalized_by_member_id:uuid?`; `finalized_at:timestamptz?`.

**Reglas:** UNIQUE(organization_id,patient_id,versión). status: draft/final. Final exige aprobador y fecha. La historia y secciones finales se vuelven inmutables; una corrección crea versión nueva del mismo paciente. Prevención de ciclos en supersedes mediante transacción/trigger.

**Claves destino de FK:** `UNIQUE(organization_id,id)`; `UNIQUE(organization_id,patient_id,id)`.

**Relaciones:** `(organization_id,patient_id) -> patients(organization_id,id)`; `(organization_id,template_id) -> clinical_templates(organization_id,id)`; `(organization_id,patient_id,supersedes_history_id) -> clinical_histories(organization_id,patient_id,id)`; `(organization_id,authored_by_member_id) -> organization_members(organization_id,id)`; `(organization_id,finalized_by_member_id) -> organization_members(organization_id,id)`.

**Índices de consulta:** `(organization_id,patient_id,created_at DESC,id)`.


#### `clinical_history_sections`

**Origen de la entidad:** Master Prompt. **Alcance:** tenant.

**Comunes:** `id:uuid PK default gen_random_uuid()`; `created_at:timestamptz default now()`; `organization_id:uuid NOT NULL FK organizations.id ON DELETE RESTRICT`; `updated_at:timestamptz default now()`.

**Campos:** `patient_id:uuid`; `history_id:uuid`; `section_key:text`; `position:integer`; `payload:jsonb`.

**Reglas:** UNIQUE(organization_id,history_id,section_key). Una seccion pertenece a historia y paciente coincidentes. payload validado contra la versión de plantilla. Bloquear cambios de secciones cuando la historia esta finalizada.

**Claves destino de FK:** `UNIQUE(organization_id,id)`.

**Relaciones:** `(organization_id,patient_id) -> patients(organization_id,id)`; `(organization_id,patient_id,history_id) -> clinical_histories(organization_id,patient_id,id)`.

**Índices de consulta:** `(organization_id,history_id,position)`.


#### `clinical_encounters`

**Origen de la entidad:** Master Prompt. **Alcance:** tenant.

**Comunes:** `id:uuid PK default gen_random_uuid()`; `created_at:timestamptz default now()`; `organization_id:uuid NOT NULL FK organizations.id ON DELETE RESTRICT`; `updated_at:timestamptz default now()`.

**Campos:** `patient_id:uuid`; `contact_id:uuid`; `appointment_id:uuid?`; `practitioner_member_id:uuid`; `started_at:timestamptz`; `ended_at:timestamptz?`; `status:text=in_progress`; `reason:text?`.

**Reglas:** status: in_progress/completed/cancelled. ended_at >= started_at. FK paciente+contacto y cita+contacto garantizan que la cita corresponde al paciente, no solo al tenant. Máximo un encuentro por cita no nula, UNIQUE parcial. Completar cita no firma notas.

**Claves destino de FK:** `UNIQUE(organization_id,id)`; `UNIQUE(organization_id,patient_id,id)`.

**Relaciones:** `(organization_id,contact_id,patient_id) -> patients(organization_id,contact_id,id)`; `(organization_id,contact_id) -> contacts(organization_id,id)`; `(organization_id,contact_id,appointment_id) -> appointments(organization_id,contact_id,id)`; `(organization_id,practitioner_member_id) -> organization_members(organization_id,id)`.

**Índices de consulta:** `(organization_id,patient_id,started_at DESC,id); UNIQUE(organization_id,appointment_id) WHERE appointment_id IS NOT NULL`.


#### `progress_notes`

**Origen de la entidad:** Master Prompt. **Alcance:** tenant.

**Comunes:** `id:uuid PK default gen_random_uuid()`; `created_at:timestamptz default now()`; `organization_id:uuid NOT NULL FK organizations.id ON DELETE RESTRICT`; `updated_at:timestamptz default now()`.

**Campos:** `patient_id:uuid`; `encounter_id:uuid`; `authored_by_member_id:uuid`; `template_id:uuid?`; `version:integer`; `source:text=manual`; `ai_generation_id:uuid?`; `content:jsonb`; `status:text=draft`; `supersedes_note_id:uuid?`; `approved_by_member_id:uuid?`; `approved_at:timestamptz?`.

**Reglas:** UNIQUE(organization_id,encounter_id,versión). status: draft/final; source: manual/ai. source=ai exige ai_generation_id. Final exige aprobación explícita con permiso clinical.approve. Contenido final inmutable; correcciones por versión/adenda. Comprobar que AI y nota corresponden también al mismo encuentro cuando AI lo tenga. supersedes dentro del mismo encuentro.

**Claves destino de FK:** `UNIQUE(organization_id,id)`; `UNIQUE(organization_id,encounter_id,id)`.

**Relaciones:** `(organization_id,patient_id) -> patients(organization_id,id)`; `(organization_id,patient_id,encounter_id) -> clinical_encounters(organization_id,patient_id,id)`; `(organization_id,template_id) -> clinical_templates(organization_id,id)`; `(organization_id,patient_id,ai_generation_id) -> clinical_ai_generations(organization_id,patient_id,id)`; `(organization_id,encounter_id,supersedes_note_id) -> progress_notes(organization_id,encounter_id,id)`; `(organization_id,authored_by_member_id) -> organization_members(organization_id,id)`; `(organization_id,approved_by_member_id) -> organization_members(organization_id,id)`.

**Índices de consulta:** `(organization_id,patient_id,created_at DESC,id)`.


#### `patient_documents`

**Origen de la entidad:** Master Prompt. **Alcance:** tenant.

**Comunes:** `id:uuid PK default gen_random_uuid()`; `created_at:timestamptz default now()`; `organization_id:uuid NOT NULL FK organizations.id ON DELETE RESTRICT`; `updated_at:timestamptz default now()`.

**Campos:** `patient_id:uuid`; `encounter_id:uuid?`; `uploaded_by_member_id:uuid`; `bucket_id:text`; `object_path:text`; `original_filename:text`; `mime_type:text`; `size_bytes:bigint`; `sha256:text?`; `category:text`; `status:text=pending`.

**Reglas:** UNIQUE(bucket_id,object_path). size_bytes >= 0 con límite configurable. status: pending/available/quarantined/deleted. Ubicación privada sin URL firmada persistida. Operaciones Storage via API, no DML directo a storage.objects. No asumir atomicidad entre archivo y metadata.

**Claves destino de FK:** `UNIQUE(organization_id,id)`; `UNIQUE(organization_id,patient_id,id)`.

**Relaciones:** `(organization_id,patient_id) -> patients(organization_id,id)`; `(organization_id,patient_id,encounter_id) -> clinical_encounters(organization_id,patient_id,id)`; `(organization_id,uploaded_by_member_id) -> organization_members(organization_id,id)`.

**Índices de consulta:** `(organization_id,patient_id,created_at DESC,id)`.


#### `clinical_images`

**Origen de la entidad:** Master Prompt. **Alcance:** tenant.

**Comunes:** `id:uuid PK default gen_random_uuid()`; `created_at:timestamptz default now()`; `organization_id:uuid NOT NULL FK organizations.id ON DELETE RESTRICT`; `updated_at:timestamptz default now()`.

**Campos:** `patient_id:uuid`; `encounter_id:uuid?`; `uploaded_by_member_id:uuid`; `bucket_id:text`; `object_path:text`; `original_filename:text`; `mime_type:text`; `size_bytes:bigint`; `image_type:text`; `acquired_at:timestamptz?`; `deidentification_reviewed:boolean=false`; `status:text=pending`.

**Reglas:** UNIQUE(bucket_id,object_path). Archivo privado; image_type usa catálogo validado. Revisión de anonimato no se infiere de la extension. status: pending/available/quarantined/deleted. Análisis IA solo a petición, no al subir.

**Claves destino de FK:** `UNIQUE(organization_id,id)`; `UNIQUE(organization_id,patient_id,id)`.

**Relaciones:** `(organization_id,patient_id) -> patients(organization_id,id)`; `(organization_id,patient_id,encounter_id) -> clinical_encounters(organization_id,patient_id,id)`; `(organization_id,uploaded_by_member_id) -> organization_members(organization_id,id)`.

**Índices de consulta:** `(organization_id,patient_id,acquired_at DESC,id)`.


#### `consents`

**Origen de la entidad:** Master Prompt. **Alcance:** tenant.

**Comunes:** `id:uuid PK default gen_random_uuid()`; `created_at:timestamptz default now()`; `organization_id:uuid NOT NULL FK organizations.id ON DELETE RESTRICT`; `updated_at:timestamptz default now()`.

**Campos:** `patient_id:uuid`; `encounter_id:uuid?`; `template_id:uuid`; `document_id:uuid?`; `status:text=draft`; `granted_at:timestamptz?`; `revoked_at:timestamptz?`; `recorded_by_member_id:uuid`; `evidence_metadata:jsonb={}`.

**Reglas:** status: draft/granted/revoked. granted exige evidencia y fecha; revoked exige fecha. Documento/encuentro del mismo paciente. Registro de evidencia no equivale por si mismo a firma electrónica legalmente válida.

**Claves destino de FK:** `UNIQUE(organization_id,id)`.

**Relaciones:** `(organization_id,patient_id) -> patients(organization_id,id)`; `(organization_id,patient_id,encounter_id) -> clinical_encounters(organization_id,patient_id,id)`; `(organization_id,template_id) -> clinical_templates(organization_id,id)`; `(organization_id,patient_id,document_id) -> patient_documents(organization_id,patient_id,id)`; `(organization_id,recorded_by_member_id) -> organization_members(organization_id,id)`.

**Índices de consulta:** `(organization_id,patient_id,status)`.


### 06 Planes y presupuestos clínicos


#### `treatment_plans`

**Origen de la entidad:** Master Prompt. **Alcance:** tenant.

**Comunes:** `id:uuid PK default gen_random_uuid()`; `created_at:timestamptz default now()`; `organization_id:uuid NOT NULL FK organizations.id ON DELETE RESTRICT`; `updated_at:timestamptz default now()`.

**Campos:** `patient_id:uuid`; `encounter_id:uuid?`; `authored_by_member_id:uuid`; `title:text`; `clinical_notes:text?`; `currency:char(3)`; `status:text=draft`.

**Reglas:** status: draft/presented/accepted/partially_accepted/rejected/completed. Datos clínicos; recepción no recibe automáticamente detalles. Estado debe concordar con items en operación transaccional.

**Claves destino de FK:** `UNIQUE(organization_id,id)`; `UNIQUE(organization_id,patient_id,id)`.

**Relaciones:** `(organization_id,patient_id) -> patients(organization_id,id)`; `(organization_id,patient_id,encounter_id) -> clinical_encounters(organization_id,patient_id,id)`; `(organization_id,authored_by_member_id) -> organization_members(organization_id,id)`.

**Índices de consulta:** `(organization_id,patient_id,status)`.


#### `treatment_plan_items`

**Origen de la entidad:** Master Prompt. **Alcance:** tenant.

**Comunes:** `id:uuid PK default gen_random_uuid()`; `created_at:timestamptz default now()`; `organization_id:uuid NOT NULL FK organizations.id ON DELETE RESTRICT`; `updated_at:timestamptz default now()`.

**Campos:** `patient_id:uuid`; `plan_id:uuid`; `service_id:uuid?`; `procedure_label:text`; `tooth_or_region:text?`; `position:integer`; `quantity:numeric(10,2)`; `unit_price:numeric(14,2)`; `discount_amount:numeric(14,2)=0`; `status:text=proposed`.

**Reglas:** quantity > 0, unit_price >= 0, 0 <= discount_amount <= round(quantity*unit_price,2). status: proposed/accepted/rejected/completed. Snapshot de precio/texto. tooth_or_region no implica odontograma implementado. Total de linea calculado; moneda del plan.

**Claves destino de FK:** `UNIQUE(organization_id,id)`; `UNIQUE(organization_id,plan_id,id)`.

**Relaciones:** `(organization_id,patient_id) -> patients(organization_id,id)`; `(organization_id,patient_id,plan_id) -> treatment_plans(organization_id,patient_id,id)`; `(organization_id,service_id) -> services(organization_id,id)`.

**Índices de consulta:** `(organization_id,plan_id,position)`.


#### `quotes`

**Origen de la entidad:** Master Prompt. **Alcance:** tenant.

**Comunes:** `id:uuid PK default gen_random_uuid()`; `created_at:timestamptz default now()`; `organization_id:uuid NOT NULL FK organizations.id ON DELETE RESTRICT`; `updated_at:timestamptz default now()`.

**Campos:** `patient_id:uuid`; `plan_id:uuid?`; `quote_number:text`; `revision:integer=1`; `supersedes_quote_id:uuid?`; `currency:char(3)`; `status:text=draft`; `valid_until:date?`; `presented_at:timestamptz?`; `authored_by_member_id:uuid`.

**Reglas:** UNIQUE(organization_id,quote_number,revisión). Estados según Master Prompt: draft/presented/accepted/partially_accepted/rejected/completed. Presupuesto clínico protegido incluso si aparece en ficha CRM. Al presentar, congelar cantidades/precios; cambios como revisión. Total calculado desde items, no número arbitrario del cliente.

**Claves destino de FK:** `UNIQUE(organization_id,id)`; `UNIQUE(organization_id,patient_id,id)`.

**Relaciones:** `(organization_id,patient_id) -> patients(organization_id,id)`; `(organization_id,patient_id,plan_id) -> treatment_plans(organization_id,patient_id,id)`; `(organization_id,patient_id,supersedes_quote_id) -> quotes(organization_id,patient_id,id)`; `(organization_id,authored_by_member_id) -> organization_members(organization_id,id)`.

**Índices de consulta:** `(organization_id,patient_id,status)`.


#### `quote_items`

**Origen de la entidad:** Master Prompt. **Alcance:** tenant.

**Comunes:** `id:uuid PK default gen_random_uuid()`; `created_at:timestamptz default now()`; `organization_id:uuid NOT NULL FK organizations.id ON DELETE RESTRICT`; `updated_at:timestamptz default now()`.

**Campos:** `patient_id:uuid`; `quote_id:uuid`; `plan_id:uuid?`; `plan_item_id:uuid?`; `service_id:uuid?`; `description:text`; `position:integer`; `quantity:numeric(10,2)`; `unit_price:numeric(14,2)`; `discount_amount:numeric(14,2)=0`; `decision:text=pending`.

**Reglas:** quantity > 0; precios/descuentos como plan_items. decisión: pending/accepted/rejected. Si plan_item_id existe, plan_id obligatorio y debe coincidir con el plan del presupuesto; trigger/operación transaccional válida esta regla entre filas. FK item+plan y paciente+quote. No copiar diagnósticos al resumen administrativo.

**Claves destino de FK:** `UNIQUE(organization_id,id)`.

**Relaciones:** `(organization_id,patient_id) -> patients(organization_id,id)`; `(organization_id,patient_id,quote_id) -> quotes(organization_id,patient_id,id)`; `(organization_id,patient_id,plan_id) -> treatment_plans(organization_id,patient_id,id)`; `(organization_id,plan_id,plan_item_id) -> treatment_plan_items(organization_id,plan_id,id)`; `(organization_id,service_id) -> services(organization_id,id)`.

**Índices de consulta:** `(organization_id,quote_id,position)`.


### 07 IA y auditoría clínicas


#### `clinical_ai_generations`

**Origen de la entidad:** Master Prompt. **Alcance:** tenant.

**Comunes:** `id:uuid PK default gen_random_uuid()`; `created_at:timestamptz default now()`; `organization_id:uuid NOT NULL FK organizations.id ON DELETE RESTRICT`; `updated_at:timestamptz default now()`.

**Campos:** `patient_id:uuid`; `encounter_id:uuid?`; `requested_by_member_id:uuid`; `operation:text`; `provider:text`; `model:text`; `prompt_version:text`; `status:text=pending`; `input_manifest:jsonb={}`; `original_output:jsonb?`; `error_code:text?`; `finished_at:timestamptz?`.

**Reglas:** operation: image_analysis/note_draft/transcription. status: pending/running/succeeded/failed/cancelled. Original exitoso inmutable; salida NO es diagnóstico ni nota aprobada. Manifest minimizado; no guardar audio/texto completo sin necesidad. El análisis clínico no aparece en ai_generations comercial.

**Claves destino de FK:** `UNIQUE(organization_id,id)`; `UNIQUE(organization_id,patient_id,id)`.

**Relaciones:** `(organization_id,patient_id) -> patients(organization_id,id)`; `(organization_id,patient_id,encounter_id) -> clinical_encounters(organization_id,patient_id,id)`; `(organization_id,requested_by_member_id) -> organization_members(organization_id,id)`.

**Índices de consulta:** `(organization_id,patient_id,created_at DESC,id)`.


#### `radiograph_ai_analyses`

**Origen de la entidad:** Master Prompt. **Alcance:** tenant.

**Comunes:** `id:uuid PK default gen_random_uuid()`; `created_at:timestamptz default now()`; `organization_id:uuid NOT NULL FK organizations.id ON DELETE RESTRICT`; `updated_at:timestamptz default now()`.

**Campos:** `patient_id:uuid`; `clinical_image_id:uuid`; `generation_id:uuid`; `review_status:text=pending`; `reviewed_result:jsonb?`; `reviewed_by_member_id:uuid?`; `reviewed_at:timestamptz?`.

**Reglas:** UNIQUE(organization_id,generation_id). Ambos recursos del mismo paciente. review_status: pending/accepted/edited/discarded. Revisión distinta de pending exige revisor/fecha. Resultado original permanece en clinical_ai_generations; guardar versión revisada separada. Nuevas revisiones conservan trazabilidad, no reescriben original.

**Claves destino de FK:** `UNIQUE(organization_id,id)`.

**Relaciones:** `(organization_id,patient_id) -> patients(organization_id,id)`; `(organization_id,patient_id,clinical_image_id) -> clinical_images(organization_id,patient_id,id)`; `(organization_id,patient_id,generation_id) -> clinical_ai_generations(organization_id,patient_id,id)`; `(organization_id,reviewed_by_member_id) -> organization_members(organization_id,id)`.

**Índices de consulta:** `(organization_id,patient_id,created_at DESC,id); (organization_id,clinical_image_id)`.


#### `clinical_audit_events`

**Origen de la entidad:** Master Prompt. **Alcance:** tenant.

**Comunes:** `id:uuid PK default gen_random_uuid()`; `created_at:timestamptz default now()`; `organization_id:uuid NOT NULL FK organizations.id ON DELETE RESTRICT`.

**Campos:** `patient_id:uuid?`; `actor_member_id:uuid?`; `actor_kind:text`; `action:text`; `entity_type:text`; `entity_id:uuid?`; `occurred_at:timestamptz`; `safe_metadata:jsonb={}`.

**Reglas:** Append-only y sin borrado en cascada. Registrar accesos/cambios/firma/archivos/IA mediante rutas o funciones controladas. Un trigger de escritura NO registra SELECT; lectura auditada necesita mecanismo específico. Sin copiar expedientes completos, tokens ni claves al log.

**Claves destino de FK:** `UNIQUE(organization_id,id)`.

**Relaciones:** `(organization_id,patient_id) -> patients(organization_id,id)`; `(organization_id,actor_member_id) -> organization_members(organization_id,id)`.

**Índices de consulta:** `(organization_id,patient_id,occurred_at DESC,id); (organization_id,occurred_at DESC,id)`.


## 6. Archivos privados, historias y auditoría

Bucket propuesto: clinical-private, privado desde su creación. Nombre de objeto: organization_id/patient_id/uuid.ext, sin nombre de persona en la ruta. La ruta por si sola NO autoriza acceso; storage.objects exige policies de acceso coherentes con membership, permiso clínico, paciente y metadata [T3]. No mezclar archivos clínicos con assets públicos de marketing.

URLs firmadas se generan tras autorizar cada solicitud y tienen expiración; no se persisten como enlace permanente. Subida en dos fases: metadata pending -> subir por Storage API -> validar MIME/tamaño/objeto -> available. Fallos requieren reconciliación/limpieza; no fingir que PostgreSQL y Storage comparten una transacción atómica. Quarantined no se descarga ni se envia a IA.

Las FK a organizaciones, miembros, pacientes y documentos usan RESTRICT como base. En particular, borrar una organización o usuario de acceso no debe eliminar su expediente histórico en cascada. Archivar/desactivar es la operación ordinaria. La eliminación definitiva, retención, backups y recuperación se definen y autorizan separadamente antes de datos reales; el esquema no certifica cumplimiento normativo [S3].

Historia o nota final: contenido y versiones de plantilla inmutables; una corrección crea nueva versión/adenda, relacionada con la original. La aprobación cambia estado mediante funcion transaccional, verifica rol/alcance, registra actor/fecha y auditoría. La revocación de permisos no borra la autoría historica. Tampoco basta un CHECK final/approved_at para autorizar una firma.

IA clínica guarda original y revisión humana por separado. Nunca reutilizar ai_generations comercial para expedientes. Revisiones y descarte tienen usuario/fecha; ninguna salida se convierte automáticamente en diagnóstico profesional. Dictado no equivale a nota aprobada [S1,S3].

clinical_audit_events conserva hechos mínimos (quien, que, cuando, recurso, tenant), sin copias innecesarias del expediente. SELECT no dispara un trigger de escritura: para auditar lecturas se deberá usar una ruta/RPC controlada u otro mecanismo probado. Este diseño no declara ya resuelta la auditoría de lectura.

## 7. Matriz de verificaciones para migraciones posteriores

| Prueba | Resultado que deberá exigirse |
|---|---|
| No autenticado lee o escribe tablas privadas | Denegado |
| Usuario A lee/edita/borra registros de B con UUID conocido | Denegado |
| Inserta en A un lead con contact_id de B | Falla FK y/o autorización |
| Une una nota al encuentro de otro paciente dentro de A | Falla FK de paciente |
| Usuario miembro de A y B intenta mover una fila cambiando organization_id | Denegado |
| Member modifica su rol, grants o clinical_scope | Denegado |
| Se suspende membresía, pero el navegador conserva token | Acceso al tenant denegado |
| Reception/Owner comercial abre historia, RX o descripción clínica del presupuesto | Denegado salvo concesión explícita aplicable |
| Profesional autorizado consulta paciente asignado | Permitido |
| Profesional con alcance assigned consulta paciente no asignado | Denegado |
| Se finaliza nota IA sin aprobador o sin clinical.approve | Denegado |
| Se edita contenido de nota/historia final | Denegado; requiere nueva versión |
| Se enlaza presupuesto con item de otro plan | Denegado |
| Se cambia catálogo de precios | Presupuesto presentado permanece igual |
| Favorito/progreso de usuario 1 modificado por usuario 2 | Denegado |
| URL de archivo de B, objeto quarantined o URL firmada vencida | Acceso no permitido según mecanismo correspondiente |
| Consulta de dashboard o vista evita RLS | No permitida; vista security_invoker o alternativa protegida |
| Crear tabla sin policies | Sin acceso de cliente, no apertura temporal |

Los tests positivos son tan importantes como los negativos: que todas las consultas fallen no demuestra que el sistema funcione. Las pruebas usan roles reales anon/authenticated y usuarios sintéticos, nunca solo postgres o service_role. Las pruebas de integridad y RLS se guardarán junto a las migraciones.

## 8. Plan de migraciones por dependencia

Este plan divide el trabajo; NO cambia el orden numerado del Master Build Order ni habilita todos los módulos ahora.

1. Step 5: organizations, organization_members, profiles, permisos base y funciones controladas de alta/cambio. RLS/grants desde la creación; datos de prueba sintéticos. No esperar hasta el QA final para proteger tablas.
2. Step 6 y siguientes según tablero: Auth de app, onboarding/business_profiles/services y acceso multi-organización. Referenciar siempre el contrato antes de generar SQL.
3. Módulo CRM: contacts -> pipeline_stages -> leads -> activities/followups/appointments y preferencias.
4. Healthcare base: patients -> templates -> histories/sections -> encounters. patient_care_team se crea cuando existe patients. Su propuesta de relación no obliga a crearlo en Step 5.
5. Notas y archivos: crear clinical_ai_generations antes de agregar su FK a progress_notes, o separar ese ALTER en la migración del módulo IA. No desactivar constraints para romper dependencias.
6. Planes/presupuestos y consentimientos; después imagenes y análisis/revisiones IA.
7. Bibliotecas, favoritos, campanas, reactivacion, cursos/lecciones/progreso y métricas, según el Step de cada módulo.

Archivos futuros bajo supabase/migrations/<timestamp>_<descripción>.sql. Guardar el archivo en el repo antes de aplicarlo, probarlo en entorno de desarrollo y registrar nombre/resultado. Si se aplica por conector usar apply_migration y mantener la MISMA versión local/remota; no crear una segunda migración equivalente. No ejecutar DDL remoto suelto y luego fingir historial sincronizado [T4].

No usar db reset sobre una base remota ni comandos destructivos sin autorización. Git push sube archivos; no equivale a aplicar la migración. No modificar manualmente supabase_migrations.schema_migrations para ocultar divergencias.

## 9. Decisiones propuestas y pendientes delimitados

Se propone aceptar: UUID, tenant por organización, claves compuestas, contactos sin duplicar clientes/pacientes, permisos clínicos separados, contenido JSONB validado/versionado, snapshots financieros, bibliotecas por tenant y migraciones por módulo. Estos valores podrán cambiar mediante Decisión Log; no se los etiqueta como aprobados antes de la revisión de José.

Antes de habilitar flujos correspondientes deben cerrarse: bootstrap del responsable clínico; permisos de lectura limitada de presupuestos para recepción; transiciones exactas de planes/presupuestos; política de solapamientos de citas; fuente precisa de inactividad y conversión para métricas; retención/borrado/recuperación y validación regulatoria de uso real. Son decisiones de esos módulos, no excusa para abrir acceso o almacenar pacientes reales ahora.

No se incluyen como implementados: odontograma, pagos/facturación, receta electrónica, firma avanzada, interoperabilidad, envíos automáticos de WhatsApp ni análisis diagnóstico autónomo. El Healthcare Vertical ya situa varias de esas funciones después del MVP [S3].

## 10. Estado de pruebas de esta entrega

Se realizo validación estática del catálogo JSON: cobertura de las entidades exigidas; nombres únicos; existencia de tablas/columnas referenciadas; igual número de columnas en cada FK; organization_id en cada relación tenant; claves UNIQUE de destino registradas. Reporte en schema-v1-validation.txt.

Esto NO ejecuta SQL, no válida sintaxis de una migración y no prueba RLS ni rendimiento. No se ha aplicado DDL, modificado auth/storage ni creado pacientes. No hay cambios en Next.js y no se exige repetir lint/typecheck/build por guardar solo estos documentos.

Cierre propuesto: José revisa y guarda los documentos en docs/database, hace commit/push y confirma. Hasta esa revisión, Step 4 queda en QA, no Done. No iniciar Step 5 automáticamente.

Commit sugerido: docs: define multitenant database schema v1

## 11. Referencias

Las referencias S son requisitos del proyecto; las T sustentan mecanismos técnicos. El modelo concreto, sus columnas y reglas son propuesta de esta entrega.


- [S1] Master Prompt suministrado por José: https://app.notion.com/p/3dfb44cff9838177a986e4e718b227fc


- [S2] Step 4: criterio de aceptacion: https://app.notion.com/p/3dfb44cff98381a8a8d5cd2b417815bf


- [S3] Healthcare Vertical: https://app.notion.com/p/3dfb44cff98381fb8301eebe279e0777


- [T1] Supabase: RLS y grants: https://supabase.com/docs/guides/database/postgres/row-level-security


- [T2] PostgreSQL 17: constraints y FK compuestas: https://www.postgresql.org/docs/17/ddl-constraints.html


- [T3] Supabase Storage: acceso: https://supabase.com/docs/guides/storage/security/access-control


- [T4] Supabase: migraciones: https://supabase.com/docs/guides/deployment/database-migrations
