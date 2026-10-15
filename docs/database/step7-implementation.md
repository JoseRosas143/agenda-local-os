# Step 7 — aislamiento de datos de negocio y base CRM

Estado: **preparado para revisión; no aplicado a la base remota**.

## Alcance

La migración `20261015063721_step7_core_business_rls.sql` añade nueve tablas del contrato de `schema-v1.md`: `business_profiles`, `services`, `contacts`, `pipeline_stages`, `leads`, `activities`, `followups`, `appointments` y `communication_preferences`. No incluye pacientes, expedientes, archivos clínicos, mensajes salientes ni datos reales. No modifica la migración Step 5 ni crea registros de prueba persistentes.

Cada tabla tiene RLS activo. La lectura exige membresía activa en una organización activa mediante `private.current_org_role` del Step 5. Los permisos a `anon` están revocados. Los dueños y administradores activos pueden crear y editar únicamente los campos permitidos de perfil de negocio, catálogo de servicios y contactos. Los miembros pueden leer los datos de su negocio, pero no escribirlos. No se concede borrado. Las columnas de identidad y las marcas de tiempo se protegen por grants y trigger; el progreso de onboarding no es editable por el cliente.

Las seis tablas de flujo CRM (`pipeline_stages`, `leads`, `activities`, `followups`, `appointments`, `communication_preferences`) son **solo lectura para clientes**. Es deliberado: todavía no hay APIs transaccionales para cambios de etapa/conversión + activity, correcciones append-only, gestión de citas y evidencia de consentimiento. Las claves foráneas compuestas fuerzan que referencias entre contactos, leads, servicios, miembros y citas pertenezcan al mismo negocio incluso cuando escribe un rol privilegiado.

## Diferencias y pendientes del contrato

- `activities.kind` usa `conversion` (ASCII) como valor persistido en lugar de `conversión`; la interfaz puede mostrar la etiqueta española.
- No se siembran las ocho etapas iniciales. Deben crearse de forma transaccional por negocio en el flujo CRM futuro.
- `activities.metadata` solo admite objetos JSON, pero aún no tiene lista permitida de claves; por eso no se concedió escritura directa.
- `communication_preferences` no presupone consentimiento; `unknown` es el valor por defecto. Falta política jurídica por canal y API auditada para cambios.
- La aplicación actual no usa aún estas tablas. Step 7 establece estructura y seguridad; no significa que el CRM o el onboarding completo estén operativos.

## Validación segura

1. Revisar la migración y confirmar que el remoto solo tiene la migración Step 5 `20260927045000` aplicada.
2. En un proyecto de desarrollo o staging, aplicar mediante Supabase CLI, nunca pegando fragmentos en SQL Editor. Ejecutar primero `supabase db push --dry-run`; inspeccionar la única migración pendiente; después `supabase db push` solo con autorización explícita para ese proyecto. No ejecutar en producción por inferencia.
3. Ejecutar el archivo completo `supabase/tests/step7_core_security.sql` en SQL Editor como `postgres`. Usa roles reales `anon`/`authenticated` con JWT simulado; termina en `ROLLBACK`. Debe mostrar `24 / 24 / true`. Si se interrumpe, ejecutar `ROLLBACK;` en la misma sesión antes de continuar.
4. Comprobar manualmente desde dos usuarios reales de negocios distintos que las lecturas cruzadas devuelven cero filas y que no hay escritura CRM directa. La simulación SQL no sustituye QA por HTTP/JWT real.
5. Revisar Supabase Security Advisor y plan de consultas. Distinguir hallazgos previos del Step 5 de los nuevos.

## Criterios de salida

- Migración aplicada sin errores en staging y `24/24` pruebas transaccionales.
- No hay lecturas ni escrituras cruzadas de tenant; membresía suspendida pierde acceso.
- FKs compuestas rechazan referencias entre negocios.
- Verificación real de dos usuarios y revisión de privilegios completadas.
- Despliegue de app, si se realiza, es un paso independiente. No llamar Step 7 listo para producción solo por pasar pruebas SQL.
