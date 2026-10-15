# Step 8 — Asistente de configuración del negocio

Estado: **In Progress** hasta ejecutar la migración, las pruebas de seguridad y el QA con cuentas reales. Este Step 8 del *Master Build Order* es distinto del CRM 8A (contactos/servicios) y del futuro CRM 8B.

## Alcance entregado

| Paso | Dato | Persistencia |
| --- | --- | --- |
| 1 | Nombre del negocio | `organizations.name`, durante la creación existente |
| 2 | Industria General, Dental o Médico | `organizations.industry`; el flag `healthcare_enabled` lo establece el RPC existente |
| 3 | Ciudad | `business_profiles.city` |
| 4 | Servicios | Al menos uno activo en `services`, mediante el catálogo existente |
| 5 | Precios | Confirmación del precio del servicio activo; los montos viven solo en `services.price` |
| 6 | Cliente ideal | `business_profiles.ideal_customer` |
| 7 | WhatsApp | `business_profiles.whatsapp_phone`, opcional y sin consentimiento de marketing implícito |
| 8 | Tono | `business_profiles.tone` |
| 9 | Objetivo principal | `business_profiles.primary_goal`, marca la finalización |

Se puede salir y reanudar sin duplicar negocios. Sólo owner/admin ve la configuración y puede guardar. El RPC vuelve a validar la membresía activa, el orden y los datos; bloquea actualizaciones concurrentes en la organización y escribe un evento de auditoría por paso sin guardar los textos del usuario en `safe_metadata`. Un miembro de solo lectura no puede abrir la página ni llamar al RPC. El avance y la fecha de finalización no son editables directamente por clientes.

Para negocios Dental/Médico, el flag sectorial existente puede estar activo, pero **no** se crean expedientes, roles clínicos, plantillas clínicas, mensajería ni automatizaciones. Esos flujos necesitan sus propias autorizaciones y QA.

## Orden seguro de adopción

1. En `C:\dev\Agenda Local OS\agenda-local-os`, verificar que el cambio local pendiente de `supabase/tests/step5_verify (1).sql` es ajeno a este paso; no restaurarlo ni incluirlo en el commit por accidente.
2. Aplicar los archivos del parche de revisión después de hacer un respaldo. No sobrescribir archivos nuevos que ya existan ni archivos rastreados que se hayan modificado desde el commit base.
3. Antes de cualquier despliegue, respaldar la base remota por el procedimiento privado ya establecido. Ejecutar `npx supabase migration list --linked` y `npx supabase db push --linked --dry-run`; el único pendiente debe ser `20261015120702_step8_business_onboarding.sql`. Revisar el SQL completo. Si la revisión es correcta y se autoriza, `npx supabase db push --linked`. **No desplegar la web nueva antes de la migración.**
4. Para QA de permisos, preferir Supabase local con Docker. Ejecutar el archivo completo `supabase/tests/step8_onboarding_security.sql` en una base de prueba con las migraciones instaladas. Debe reportar `20/20`, `all_passed=true` y terminar con `ROLLBACK`; no usar `COMMIT` ni datos reales. Si no existe entorno local, no ejecutar este archivo en producción sin una revisión específica.
5. Ejecutar `node --test tests/onboarding/*.test.mjs`, `npm run lint`, `npm exec tsc -- --noEmit`, `npm run build`, `git diff --check`.
6. Probar en navegador con dos negocios y las dos cuentas ya usadas en QA: creación → paso 3; completar 3–9; volver a editar un servicio desde pasos 4/5; cerrar sesión y continuar; WhatsApp vacío; servicio inactivo; rol miembro sin acceso; URL directa a pasos adelantados redirige al paso real. Confirmar que no se ve información del otro negocio.
7. Sólo después del QA real, registrar resultados en Notion, considerar el Step 8 como Done y decidir el commit/push/despliegue. No se hace push ni migración desde el parche.

## Criterios de aceptación

- Los nueve pasos aparecen en orden, persisten y terminan con “Tu Agenda Local OS está lista.”
- El negocio creado con industria Dental o Médico conserva su flag sectorial; no adquiere permisos clínicos.
- La navegación entre asistente y catálogo vuelve al paso correspondiente.
- No se puede saltar pasos, falsificar el progreso ni escribir como miembro o de otro negocio.
- Repetir un guardado seguro no crea otra organización ni servicio.

## Mejoras candidatas (sin prometerlas como completadas)

- **Editar Datos del Negocio y robustecer**: idea ya registrada en el backlog de Notion. Aplica después de estabilizar este asistente: permitir editar nombre, ciudad, timezone, moneda e industria bajo reglas de compatibilidad; el cambio de industria no debe activar permisos clínicos por accidente.
- Añadir una revisión final de todos los nueve datos antes de marcar Done y un indicador discreto en “Mis negocios”.
- Para catálogos grandes, sustituir la lista limitada de 30 servicios por una vista de revisión con paginación y señalización explícita de precios faltantes.
- Probar diseño responsive, accesibilidad de teclado y estados de error con usuarios reales antes de iniciar CRM 8B.
