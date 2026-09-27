# Agenda Local OS - Step 5: organizaciones, membresias y roles

## Estado de esta entrega

Migracion y pruebas preparadas. **Todavia no aplicadas en Supabase.** No afirmar Done hasta ejecutar las pruebas y confirmar el push. No se han creado cuentas, tablas o datos de negocio desde el conector durante esta entrega.

Base aprobada: `docs/database/schema-v1.md` del Step 4. Criterio del Dev Board: **Users can belong to organizations with explicit roles.** La implementacion de registro/login/logout de la app es Step 6 y no se incluye aqui.

Proyecto confirmado por el conector: `agenda-local-os-dev`, ref `idmkambczhdhvspbrdci`, PostgreSQL 17. Las consultas de inventario devolvieron `public/private` sin tablas y sin migraciones al iniciar. Se inspeccionaron columnas de `auth.users` y definiciones de `auth.uid()`/`auth.jwt()`, no registros personales ni claves. RAMX no se modifica.

## 1. Archivos y alcance

- `supabase/migrations/20260927045000_step5_organizations_memberships.sql`: migracion SQL ejecutable, no un fragmento del contrato.
- `supabase/tests/step5_security.sql`: 46 comprobaciones secuenciales, usuarios sinteticos y rollback completo.
- `supabase/tests/step5_verify.sql`: inventario de solo lectura de tablas/RLS/grants/RPC.
- `docs/database/step5-implementation.md`: esta guia y precisiones de implementacion.
- `docs/database/step5-static-review.txt`: comprobaciones estaticas y limites.
- `docs/database/step5-checksums.sha256`: integridad de los archivos de entrega.

Se crean solo cinco tablas: `profiles`, `organizations`, `organization_members`, `member_permissions` y `audit_events`. Las dos ultimas permiten separar concesiones de roles y registrar las operaciones de seguridad; estaban previstas en el contrato, no son un nuevo modulo de CRM. No se crean `patients`, `contacts`, `business_profiles`, `services` ni `patient_care_team` en este paso. No se modifica Auth gestionado ni Storage. La migracion no contiene usuarios de ejemplo.

## 2. Precisiones del contrato para esta implementacion

Los siguientes detalles no estaban completamente enumerados en el diccionario v1; se documentan aqui en vez de modificar silenciosamente el contrato:

1. Membresias: `status` admite `active` y `suspended`. Las invitaciones pendientes aun no son membresias; se disenaran al implementar invitaciones. No hay borrado duro desde la app.
2. Solo `owner` puede asignar o modificar roles comerciales elevados. `admin` puede dar de alta o suspender/reactivar exclusivamente miembros con rol comercial `member`; no puede modificar owner/admin ni promocionarse.
3. La creacion de una organizacion y su primer owner es una operacion atomica. El `user_id` del propietario viene de `auth.uid()`, nunca de un parametro de formulario.
4. `add_organization_member` es aprovisionamiento administrativo por UUID de un usuario ya registrado en Auth. No busca correos, no registra un usuario nuevo, no envia invitaciones y no permite autoinscripcion a otra organizacion. Las pantallas y el consentimiento/invitacion por correo no se presentan como implementados.
5. Slug: minusculas ASCII, digitos y guiones, 3-63 caracteres; nombre 1-160; zona horaria validada contra PostgreSQL; moneda en formato de tres mayusculas. Esta validacion de formato no verifica un catalogo ISO completo.
6. Al crear una organizacion dental/medical se activa su flag Healthcare; **no se habilita IA clinica ni se concede clinical_role o un permiso clinico**. El flag no crea expedientes ni demuestra cumplimiento regulatorio.
7. `member_permissions` puede leerse por su titular activo. No se expone una RPC para otorgar permisos clinicos ni para cambiar `clinical_role`/`clinical_scope`. El bootstrap de autoridad clinica sigue cerrado hasta su flujo especifico aprobado.
8. Leer `audit_events` requiere `audit.read` explicito. No se concede automaticamente al owner comercial. El SQL de pruebas otorga temporalmente ese permiso desde postgres para probarlo; todo se revierte al terminar. La administracion de estos grants desde la app queda pendiente de su flujo autorizado.
9. Los perfiles personales permiten leer/crear/editar solo datos propios. Los cambios de identidad de usuario/tenant y el borrado de membresias se rechazan. Las relaciones historicas a Auth usan RESTRICT donde corresponde: no se borra una cuenta con autoria/membresias mediante cascada.

## 3. RPC disponibles despues de aplicar

| Funcion | Firma resumida | Quien puede usarla |
|---|---|---|
| `create_organization` | nombre, slug, industria, zona, moneda -> organization UUID | Usuario autenticado no anonimo |
| `add_organization_member` | organization UUID, Auth user UUID, rol -> membership UUID | Owner; admin solo para `member` |
| `update_organization_member` | organization UUID, membership UUID, rol, estado -> void | Owner; admin solo sobre `member` |

Las RPC derivan el actor de `auth.uid()` y vuelven a comprobar membresia/rol despues de adquirir el bloqueo de la organizacion. No aceptan permisos clinicos, actor, fechas de auditoria ni contrasenas como parametros. No hay `DELETE` publico de organizaciones/membresias ni traslado de un registro entre organizaciones.

Los ayudantes estan en `private`, con `search_path = ''` y EXECUTE restringido. **Mantener `private` fuera de los esquemas expuestos de la Data API.** Su USAGE para authenticated permite evaluar RLS; no equivale a exponer el esquema por HTTP. `private.has_audit_read` sirve exclusivamente para auditoria operativa; no es un guard clinico ni verifica pacientes asignados.

## 4. RLS, grants y concurrencia

Las cinco tablas tienen RLS desde su creacion. `anon` no tiene acceso ni EXECUTE de las tres RPC. `authenticated` puede leer solo las filas permitidas; las escrituras de organizaciones, membresias, grants y auditoria no se conceden directamente. Los permisos de `service_role` tampoco se dejan abiertos por defecto sobre estos objetos nuevos; la app usara el JWT del usuario, no una clave secreta para eludir RLS.

Los helpers SECURITY DEFINER evitan recursion de RLS al consultar las membresias. Ese mecanismo requiere control adicional: identidad derivada del JWT, autorizacion en cada RPC, tablas cualificadas, search_path fijo y EXECUTE minimo. Una funcion definer no se vuelve segura por llevar ese nombre.

Cada cambio de membresia actualiza/bloquea la fila padre de la organizacion. La RPC vuelve a leer el rol del actor despues del bloqueo. Un CHECK entre filas no protege al ultimo owner: aqui lo protegen la operacion controlada y triggers de restriccion; la comprobacion diferida exige un owner activo al finalizar la transaccion. La escritura real del padre busca evitar resultados basados en snapshots anteriores bajo aislamiento mas fuerte.

**No se ha ejecutado una prueba de dos conexiones concurrentes en esta entrega.** La suite incluida es secuencial. Antes de habilitar cambios de propietarios en produccion se deben probar dos owners intentando quitarse el rol a la vez, y una revocacion mientras otra transaccion espera el bloqueo. Se debe conservar al menos un owner, o abortar/reintentar la transaccion; no reportar esta prueba como aprobada aun.

Los eventos de auditoria se insertan desde triggers de membresia/grants y desde el bootstrap. El payload solo contiene claves permitidas de rol/estado/permiso; no snapshots completos, claves API ni datos clinicos. UPDATE/DELETE se rechazan. Esto no protege contra el administrador de base de datos que desactive triggers ni constituye almacenamiento inmutable externo.

## 5. Aplicacion manual con VS Code y CLI

Usamos CLI para conservar el mismo numero de migracion local/remoto. No pegar esta migracion en SQL Editor ni crear a mano sus tablas. No usar `migration repair` para ocultar errores.

### A. Copiar y revisar

Copia `supabase` y `docs` del paquete dentro de `C:\dev\Agenda Local OS\agenda-local-os`, fusionando carpetas, sin reemplazar archivos existentes del Step 4.

```powershell
cd "C:\dev\Agenda Local OS\agenda-local-os"
git status --short
```

Revisa el SQL. Si el repositorio ya tiene una migracion equivalente o estas tablas existen, detenerse y comparar; no duplicar ni borrar.

### B. Preparar CLI

Ejecuta uno por uno y detente si uno falla:

```powershell
npx supabase@latest --version
```

El uso via npm/npx requiere Node.js compatible con la CLI (la documentacion consultada indica 20 o superior). No instala un agente ni requiere Codex. Conserva la version mostrada en tus notas de QA.

```powershell
if (!(Test-Path ".\supabase\config.toml")) {
  npx supabase@latest init
}
```

```powershell
npx supabase@latest login
```

Completa el acceso en tu propia cuenta. Un Personal Access Token de la CLI NO es la publishable key de `.env.local`. No pegues tokens ni contrasenas en el chat ni en archivos versionados.

```powershell
npx supabase@latest link --project-ref idmkambczhdhvspbrdci
```

Si solicita contrasena de la base, utiliza la del proyecto de desarrollo, solo en el prompt local. No restablecerla ni compartirla para resolver este paso.

### C. Revisar antes de escribir

```powershell
npx supabase@latest migration list
npx supabase@latest db push --dry-run
```

Debe proponer unicamente `20260927045000_step5_organizations_memberships.sql`. **El dry-run no ejecuta ni valida el SQL**: muestra la cola pendiente. Si aparecen migraciones ajenas o historial divergente, detenerse.

### D. Aplicar solo al proyecto de desarrollo vinculado

```powershell
npx supabase@latest db push
npx supabase@latest migration list
```

Verifica que la version `20260927045000` aparezca tanto local como remota. No uses `--include-all`, `--include-seed`, `--force`, `db reset` ni comandos de borrado. No hace falta `supabase start` para este flujo contra el proyecto remoto de desarrollo. No se lanza un entorno local Docker.

El codigo de la app no se ha cambiado en esta entrega, por lo que no hay que volver a instalar React/Next.js ni modificar `.env.local`. La migracion requiere su propia QA SQL; un build de Next no valida RLS.

## 6. Verificaciones despues de aplicar

En SQL Editor del MISMO proyecto de desarrollo, con rol `postgres`, ejecutar primero el contenido completo de `supabase/tests/step5_verify.sql`. Es solo lectura: compara cada resultado con `expected`.

Despues ejecutar **todo** `supabase/tests/step5_security.sql` como una sola ejecucion, sin seleccionar un fragmento. Esta prueba usa tablas/funciones temporales y usuarios ficticios en una transaccion que termina en ROLLBACK. No reemplazar ROLLBACK por COMMIT. Si falla, ejecutar `ROLLBACK;`, conservar el primer error y detenerse.

Resultado esperado, no observado aun:

```text
tests_passed: 46
tests_expected: 46
all_passed: true
test_mode: SIMULATED_JWT_REAL_DB_ROLES
```

Esto verifica funciones y autorizacion con los roles SQL `anon`/`authenticated` y claims simulados. **No verifica firma/renovacion de JWT, sesiones del navegador ni flujo HTTP de signup/login.** Esas comprobaciones corresponden al Step 6. Los checks estructurales ejecutados como postgres estan identificados y no se presentan como evidencia de RLS de usuarios.

La prueba revierte todos los usuarios, organizaciones y grants de prueba. Por eso las tablas pueden volver a estar vacias despues: es correcto. No se deben crear pacientes reales para verificar este paso.

## 7. Guardar y cerrar, solo cuando pase QA

```powershell
git status --short
git add -- supabase/migrations/20260927045000_step5_organizations_memberships.sql
git add -- supabase/tests/step5_security.sql supabase/tests/step5_verify.sql
git add -- docs/database/step5-implementation.md docs/database/step5-static-review.txt docs/database/step5-checksums.sha256
```

Si la CLI creo `supabase/config.toml` y `supabase/.gitignore`, revisalos y agregalos expresamente. No agregar `.temp`, `.branches`, `.env.local`, contrasenas o tokens. Si ya existian, no sustituirlos por versiones de otros proyectos.

```powershell
git diff --cached --stat
git diff --cached
git commit -m "feat: add organizations memberships and access controls"
git push
```

Despues compartir: resultado de la migracion, resumen de las pruebas y confirmacion del push. No compartir credenciales. Si alguno falla, no iniciar Step 6 ni modificar policies para permitir todo. Una correccion posterior a una migracion ya aplicada sera otra migracion, no una edicion del historial.

## 8. Limites y siguientes pasos

Step 5 puede cerrar cuando la migracion se aplique y estas pruebas pasen, se guarden los resultados y se confirme el push. Este paquete por si solo NO cumple la verificacion runtime. No se atribuye una ejecucion en tu PC al asistente.

No se implementa en este Step: interfaz de equipos, invitaciones/email, onboarding de nueve pasos, CRM, roles clinicos concedibles, bootstrap del responsable clinico, pacientes, Storage clinico, cuotas/rate limiting de alta publica ni autenticacion de la app. El lanzamiento publico necesita estas capas en sus Steps; aprobar pruebas SQL no implica estar listo para produccion.

## Fuentes y trazabilidad

- Base interna: `docs/database/schema-v1.md`, secciones 2-5 y 8; aprobado por Jose al cerrar Step 4.
- Step 5 del Dev Board: https://app.notion.com/p/3dfb44cff98381e7a361fbe6c7eabf09
- RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Funciones y privilegios: https://supabase.com/docs/guides/database/functions
- Migraciones: https://supabase.com/docs/guides/deployment/database-migrations
- CLI: https://supabase.com/docs/reference/cli/supabase-db-push
- Uso via npx: https://supabase.com/docs/guides/local-development/cli/getting-started
- Locks PostgreSQL 17: https://www.postgresql.org/docs/17/explicit-locking.html

Las fuentes externas sustentan los mecanismos de PostgreSQL/Supabase. Las firmas de RPC, los limites de longitud y las reglas de aprovisionamiento son detalles de implementacion documentados en esta entrega, no citas de esas fuentes.
