# Agenda Local OS - Step 6: Supabase Auth y rutas protegidas

**Estado de entrega: In Progress. Código preparado; instalación y QA de la aplicación pendientes.**

## 1. Objetivo y fuentes del proyecto

Criterio original del Dev Board: **Signup/login/logout/session persistence/protected routes work.** La dependencia Step 5 fue consultada en Done. Este paquete no modifica las tablas, las RPC, los roles o las policies de ese paso.

Se inspeccionaron por el conector GitHub los archivos reales de `JoseRosas143/agenda-local-os`, rama `main`: `package.json`, `components.json`, `src/lib/supabase/server.ts`, `src/lib/utils.ts`, `src/components/ui/button.tsx`, `AGENTS.md` y el inventario de rutas. El repositorio utiliza Next.js 16.3.6, React 19.2.8, `@supabase/ssr ^0.12.7`, `@supabase/supabase-js ^2.117.2`, npm y shadcn **base-vega**, con alias `@/` e iconos Lucide. Es una inspección remota, no de cambios locales sin subir.

Referencias internas: [Step 6](https://app.notion.com/p/3dfb44cff98381d9aec7e3252c14a34c) y [Step 5](https://app.notion.com/p/3dfb44cff98381e7a361fbe6c7eabf09).

## 2. Alcance implementado en el paquete

- `/login`: correo y contraseña, validación del formulario en servidor, mensajes genéricos y estado pendiente.
- `/register`: registro por contraseña y solicitud de confirmación por correo.
- `/auth/check-email`: instrucciones y reenvío controlado por los límites del proveedor.
- `/auth/confirm`: página que recibe el token hash; pide un clic explícito antes de verificarlo. Abrirla con GET no consume el enlace.
- `/account`: página privada, exige usuario verificado no anónimo con correo confirmado; muestra solamente su propio correo e identificador.
- `/api/auth/me`: devuelve ese mismo objeto mínimo; 401 sin identidad y 503 ante fallo del servicio. No devuelve tokens.
- Cierre de sesión mediante Server Action POST, con alcance `local` del proveedor, no un endpoint GET.
- `src/proxy.ts` y `src/lib/supabase/proxy.ts`: renovación de cookies y cabeceras anti-cache, con verificación de claims.

Fuera de alcance: OAuth, restablecimiento de contraseña, MFA, invitaciones, creación automática del negocio, onboarding, CRM, acceso clínico y despliegue. No se muestran botones de esas funciones como si ya existieran. El registro crea una identidad gestionada por Supabase Auth; no crea una organización ni concede permisos.

## 3. Antes de copiar

En PowerShell, desde la raíz:

```powershell
cd "C:\dev\Agenda Local OS\agenda-local-os"
git status --short
```

El push del Step 5 ya fue confirmado. Revisa y conserva cualquier cambio local nuevo antes de fusionar archivos. No hace falta `db push`, `db reset`, SQL Editor ni volver a ejecutar migraciones para este paquete.

Copia las carpetas **src**, **tests** y **docs** del ZIP a esa raíz, fusionándolas. No copies `src` dentro de `src`. Mantén literalmente el directorio `(auth)`: es parte de la organización de rutas de Next.js, no parte de la URL.

**Único archivo existente que este paquete reemplaza deliberadamente:** `src/lib/supabase/server.ts`. El cambio agrega validación de entorno, `server-only` y escritura de cookies que no oculta fallos en Server Actions. Las llamadas existentes `createClient()` siguen siendo válidas. Los demás archivos son nuevos respecto al inventario consultado. Si alguno ya existe en tu copia por otros cambios, detente para fusionarlo en lugar de sobrescribirlo sin revisión.

No se incluyen reemplazos para `package.json`, `package-lock.json`, `components.json`, `globals.css`, el layout raíz, el botón existente ni el health check del Step 3. La página `/` original sigue intacta; entra directamente a `/login` para probar este paso.

## 4. Dependencias y componentes

Ejecuta una línea a la vez:

```powershell
npm install server-only
npx shadcn@latest add input field card alert badge spinner
```

`server-only` marca módulos que no deben importarse desde el cliente. Los seis componentes se agregan con la CLI oficial y con **tu components.json existente base-vega**. Se reutiliza `button`, no se reinstala. `field` puede agregar dependencias de UI relacionadas automáticamente; conserva esos archivos en el diff.

No uses `shadcn init`, `--overwrite`, una actualización masiva de dependencias o un cambio de preset. Si la CLI pregunta por reemplazar un archivo ya existente, conserva la versión local y comparte el mensaje para revisarlo. Los comandos de npm modificarán tus manifiestos y lockfile: es esperado, el ZIP no los sustituye.

## 5. Variables locales

Conserva la URL y publishable key que funcionaron en el Step 3. Agrega al archivo `.env.local` una sola línea:

```env
APP_URL=http://localhost:3000
```

No lleva `NEXT_PUBLIC_`: es el origen canónico del servidor para los enlaces de correo. Debe coincidir con el origen que abres en el navegador. No mezcles localhost y 127.0.0.1 durante una prueba. En despliegue se usará el dominio HTTPS validado, no el encabezado Host recibido ni una redirección aportada por el usuario.

`.env.local` sigue fuera de Git. No copies claves a TypeScript, a Notion ni a capturas. Para esta entrega no necesitas una service role key, clave secreta ni token de administración.

## 6. Configuración del proyecto Supabase de desarrollo

Proyecto: `agenda-local-os-dev` (`idmkambczhdhvspbrdci`). La configuración de Auth del dashboard NO fue modificada por el asistente.

En **Authentication / URL Configuration**, configura para este proyecto de desarrollo:

```text
Site URL: http://localhost:3000
Redirect URLs: http://localhost:3000/auth/confirm
```

Agrega la entrada exacta a la lista de redirecciones sin borrar otras entradas necesarias. No agregues comodines amplios para facilitar pruebas. Esta configuración local no debe trasladarse tal cual a producción.

En la configuración del proveedor **Email**, mantén habilitado el registro por correo y **Confirm email**. No desactives la confirmación para lograr que una prueba aparente funcionar.

### Plantilla de confirmación: cambio necesario

En **Authentication / Email Templates / Confirm signup**, conserva tu diseño y cambia solamente el enlace de confirmación. El `href` debe ser:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Confirmar mi correo</a>
```

Este formato utiliza las variables de plantilla oficiales. La app verifica `token_hash` con `verifyOtp`, exclusivamente para `type=email`; no utiliza el callback PKCE por código en este paso. No crees otro `auth/confirm/route.ts` junto a la página incluida.

El recorrido es **correo -> /auth/confirm -> clic en Confirmar mi correo -> Server Action -> verificación Supabase -> cookies -> /account**. El paso intermedio evita consumir automáticamente el token al cargar la página. Es una medida contra algunos escáneres/previsualizadores, no una garantía frente a todos ellos.

Guarda la plantilla ANTES del primer registro. Un correo emitido con la plantilla anterior no cambia al editarla: prueba con un enlace nuevo, respetando los límites del servicio. No pegues enlaces de confirmación completos en el chat: contienen un token de un solo uso.

### Si no llega el correo

Sin SMTP personalizado, Supabase restringe los correos de prueba a destinatarios autorizados del equipo del proyecto y establece un límite reducido (la documentación consultada indica dos por hora, sujeto a cambios). Utiliza una dirección tuya autorizada y revisa spam. No envíes invitaciones a clientes ni uses cuentas de pacientes para QA. Si aparece `email_address_not_authorized` o rate limiting, conserva el fallo real, no hagas reintentos automáticos y no quites la verificación. SMTP, CAPTCHA y controles de abuso de producción se configurarán antes de una apertura pública.

## 7. Pruebas automáticas en tu computadora

Primero, sin necesitar servidor abierto:

```powershell
node --test tests/step6/validation.test.mjs
npm run lint
npm exec tsc -- --noEmit
npm run build
```

Ejecuta una línea a la vez; si falla, detente y comparte el primer error sin secretos. La suite de validación utiliza el TypeScript de tus devDependencies, sin descargar otro compilador. No modifica la base ni contacta al proveedor.

Después inicia el servidor:

```powershell
npm run dev
```

Mantén esa terminal abierta. En una segunda terminal de la misma carpeta:

```powershell
node --test tests/step6/guest-http.mjs
```

Son siete pruebas HTTP de **invitado**, contra `http://localhost:3000`, sin cookies, emails, altas ni escrituras. Si ocupaste otro puerto, ajusta la variable `STEP6_TEST_ORIGIN` en esa terminal y usa ese mismo origen también en APP_URL y el dashboard:

```powershell
$env:STEP6_TEST_ORIGIN="http://localhost:3000"
```

La suite espera formularios reales, redirección de `/account`, 401 en API, no-store, enlace incompleto y rechazo de una redirección externa aportada en `next`. No sustituye las pruebas de usuario autenticado ni las visuales.

## 8. QA manual obligatorio antes de cerrar

Usa datos de prueba y correos que controlas. Registra resultado, navegador y evidencia sin contraseñas/tokens.

| Caso | Acción | Resultado esperado |
|---|---|---|
| Invitado | Abrir /account en ventana privada | Redirige a /login sin datos privados |
| API de invitado | Abrir /api/auth/me sin sesión | 401 UNAUTHENTICATED, sin datos de usuario |
| Registro | Completar /register con dirección autorizada y contraseña larga | Mensaje genérico para revisar correo, sin roles asignados |
| Correo pendiente | Intentar login antes de confirmarlo | No obtiene página privada |
| Confirmación | Abrir el correo nuevo y pulsar Confirmar mi correo | /account muestra el correo/ID de esa cuenta |
| Login | Salir y entrar con correo y contraseña correctos | /account con identidad verificada |
| Error de credenciales | Usar contraseña incorrecta | Error controlado; no se devuelve la contraseña |
| Persistencia | Recargar /account y abrir otra pestaña del mismo origen | Sigue autenticado con la misma cuenta |
| API autenticada | Abrir /api/auth/me con sesión | 200, ok=true y solo id/email; sin tokens |
| Logout | Pulsar Cerrar sesión y volver a abrir /account | Login; API vuelve a 401 sin cookies |
| Enlaces | Enlace incompleto, token inválido o reutilizado | No crea acceso nuevo ni redirige a otro dominio |
| Aislamiento de navegador | Dos perfiles de navegador con cuentas distintas autorizadas | Cada uno conserva solo su propia identidad |
| Renovación | Mantener sesión hasta la expiración del access token y volver a solicitar /account | Proxy renueva; no se pierde sesión ni se mezclan usuarios |
| Visual | Desktop y ancho de 390 px; navegar con Tab y enviar formularios | Sin pantalla vacía/overlay, campos legibles, foco, errores y pending visibles |

No reduzcas el TTL en el proyecto compartido para acelerar pruebas sin una decisión explícita. Una recarga inmediata prueba persistencia, no expiración/renovación. El cierre de sesión es local al navegador; no se presenta como revocación instantánea de todos los access tokens ya emitidos.

En producción, el health check temporal del Step 3 devuelve 404 deliberadamente. Eso no es un fallo de autenticación del Step 6.

## 9. Decisiones de seguridad y límites

El Proxy obtiene/verifica claims y sincroniza cookies en request/response. Copia también las cabeceras proporcionadas al `setAll` de SSR y añade `private, no-store`; las redirecciones conservan las cookies emitidas. No se usa `getSession()` para autorizar.

`getVerifiedUser()` consulta `getUser()` en el servidor y entrega una proyección mínima. Se llama en la página que muestra los datos y en la API, no solo en un layout ni confiando en el Proxy. `cache()` es por render/request de React, no un caché global de identidades. Ante errores de servicio se deniega acceso; no se fabrica una sesión.

El matcher de este paso cubre `/login`, `/register`, `/auth/*`, `/account/*` y `/api/auth/*`. Los futuros módulos privados deben añadir su verificación cerca de cada lectura/escritura y ampliar el matcher cuando corresponda. Un usuario autenticado no queda autorizado a un negocio por ello: membresías/RLS del Step 5 seguirán siendo necesarios cuando se consulte información de organización.

Las Server Actions mantienen las comprobaciones de origen de Next.js; no agregan `allowedOrigins` amplios ni ejecutan mutaciones en GET. La contraseña se valida en servidor, nunca se recorta ni se devuelve en el estado del formulario. La regla de registro de 12 a 128 caracteres es una regla de estos formularios, no una afirmación de que ya se haya modificado la política global del proveedor. Los límites de Supabase no sustituyen un control distribuido de abuso de la app en producción.

No se incluye un cliente navegador porque estas operaciones pasan por Server Actions. Se conserva el patrón de cookies del SDK SSR para compatibilidad futura; no se afirma que sean HttpOnly. Las cookies son Secure en NODE_ENV=production; las pruebas locales descritas se hacen con `npm run dev`. Previo a producción: HTTPS, políticas de cookies/CSP, SMTP, CAPTCHA, rate limits y redacción de logs. Los query params de confirmación son sensibles aunque no los imprimamos explícitamente en nuestro código.

## 10. Evidencia real de esta entrega

**Ejecutado por el asistente:** 30 pruebas unitarias del módulo real de validación; revisión de sintaxis/transpilación de los 22 archivos TS/TSX; typecheck estricto SOLO del módulo puro; comprobación de imports internos y sintaxis del script HTTP. Ver `step6-validation.txt`.

**No ejecutado por el asistente:** typecheck completo de Next.js, lint, build, pruebas HTTP contra la app, envío de correo, alta/login/logout reales, pruebas de refresh, capturas y pruebas visuales. Git clone falló por DNS de github.com; npm/shadcn no pudieron descargar dependencias (EAI_AGAIN registry.npmjs.org). El Browser plugin no está listado y Playwright offline devolvió ENOTCACHED. No hay aplicación corriendo en este entorno. No se sustituyeron las librerías por stubs para declarar aprobada la compilación.

Se usó la documentación oficial actual después de que no fuera posible ejecutar `npx shadcn@latest docs`. No se pudieron leer los documentos del Next.js instalado en node_modules desde la computadora de José; la versión objetivo fue cotejada con su package.json y la documentación web. Todos los resultados de comportamiento siguen sujetos a QA local.

## 11. Cierre posterior a QA, no ejecutar antes

Tras confirmar las pruebas, revisa `git status --short` y prepara solo los archivos de este Step, los componentes añadidos por CLI y los dos manifiestos npm. No incluyas secretos ni .env.local; no hay migración nueva.

```powershell
git add -- src/features/auth src/lib/auth src/lib/supabase src/proxy.ts
git add -- 'src/app/(auth)' src/app/account src/app/api/auth
git add -- tests/step6 docs/auth src/components/ui package.json package-lock.json
git diff --cached --stat
git diff --cached
```

Revisa que los archivos agregados en `src/components/ui` correspondan a esta instalación y que no haya cambios locales ajenos. No uses --force. Solo cuando la revisión y QA estén aprobados:

```powershell
git commit -m "feat: implement supabase auth and protected routes"
git push
```

El Step 6 no se marca Done por descargar este paquete o por pasar sus tests puros. No se inicia el Step 7 automáticamente.

## Referencias oficiales consultadas

- [Supabase: cliente SSR, Proxy, getClaims/getUser y cookies](https://supabase.com/docs/guides/auth/server-side/creating-a-client).
- [Supabase: tutorial Next.js, enlace token_hash](https://supabase.com/docs/guides/getting-started/tutorials/with-nextjs).
- [Supabase: variables y edición de Email Templates](https://supabase.com/docs/guides/auth/auth-email-templates).
- [Supabase: restricciones de SMTP de prueba](https://supabase.com/docs/guides/auth/auth-smtp).
- [Supabase: signOut y scope](https://supabase.com/docs/reference/javascript/auth-signout).
- [Next.js: autenticación y autorización cerca de los datos](https://nextjs.org/docs/app/guides/authentication).
- [Next.js: convención proxy.ts](https://nextjs.org/docs/app/api-reference/file-conventions/proxy).
- [shadcn Base UI: Field](https://ui.shadcn.com/docs/components/base/field), [Input](https://ui.shadcn.com/docs/components/base/input), [Card](https://ui.shadcn.com/docs/components/base/card), [Alert](https://ui.shadcn.com/docs/components/base/alert), [Spinner](https://ui.shadcn.com/docs/components/base/spinner).
