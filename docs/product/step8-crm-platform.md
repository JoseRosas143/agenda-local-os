# Agenda Local OS — plataforma CRM amplia

Estado: **Step 8A aplicado y probado localmente; despliegue pendiente. La interfaz con un miembro real no se probó por el alcance acordado**.

## Dirección de producto

Tomar de HighLevel el modelo de trabajo integrado —contactos, oportunidades, agenda, conversaciones, automatizaciones, captación y cobros—, no copiar su interfaz, marca o catálogo completo. Agenda Local OS conservará una experiencia en español, clara, móvil y de baja fricción para negocios locales. La navegación debe revelar solo módulos operativos: no presentar botones que prometan acciones todavía no implementadas.

La referencia funcional está documentada por HighLevel en su [visión de CRM](https://www.gohighlevel.com/crm/marketing-agency) y su [guía de oportunidades](https://help.gohighlevel.com/support/solutions/articles/155000005062-getting-started-setup-pipelines-and-opportunities). La implementación propia se rige por el contrato de `docs/database/schema-v1.md`, las migraciones locales y la seguridad por negocio de Step 5/7.

## 8A — primera superficie funcional

- Entrar al espacio desde “Mis negocios”.
- Resumen real de contactos y servicios activos.
- Listar, crear y editar contactos y servicios; archivar/reactivar contactos y activar/desactivar servicios, sin borrado.
- Paginación limitada, estados vacíos, validación de campos y respuestas sin eco ilimitado de entradas.
- Autorización de dueño/administrador comprobada en cada acción del servidor, más RLS y grants de Step 7. Los miembros solo leen.
- Sin clave de servicio en la aplicación y sin escritura en leads, pipeline, actividades, seguimientos, citas ni preferencias de comunicación.

La maqueta visual de esta entrega está en `docs/product/step8-crm-concept.png`. La interfaz final usa controles HTML/React, no una imagen estática.

## Secuencia posterior

1. **8B, CRM comercial:** etapas por negocio, oportunidades, cambio de etapa atómico, actividad append-only, tareas y seguimiento. Crear una migración nueva y RPCs auditadas; no conceder escritura directa a las tablas de flujo.
2. **8C, agenda:** disponibilidad, reservas, prevención de dobles citas, cancelación/reprogramación, zona horaria y recordatorios con estados explícitos. Probar concurrencia y aislamiento entre negocios.
3. **8D, conversaciones:** bandeja por contacto y canal, email/SMS/WhatsApp solo tras elegir proveedores y registrar consentimiento, opt-out, plantillas, entrega, reintentos e idempotencia de webhooks. No enviar mensajes por defecto.
4. **8E, captación y automatización:** formularios versionados, validación antispam, campañas, segmentación y motor de reglas con límites, vista previa y modo borrador antes de publicar. Cada ejecución debe ser auditable y reversible cuando corresponda.
5. **8F, pagos:** integración mediante checkout alojado del proveedor elegido; no almacenar tarjetas. Conciliar webhooks firmados, reembolsos, impuestos y errores antes de habilitar cobros.

## Puertas de salida para cada módulo

- Pruebas de validación, lint, tipos, compilación y QA responsive/accesibilidad.
- Pruebas RLS con dos usuarios reales de negocios distintos y con un miembro suspendido.
- Revisión de permisos, índices, límites de volumen, respaldo y recuperación.
- Para canales y pagos: proveedor, costos, jurisdicción, consentimiento y condiciones de uso aprobados por el usuario antes de conectar credenciales o activar tráfico real.
- Despliegue solo tras prueba local/staging y aprobación específica. Una compilación satisfactoria no equivale a función probada en producción.

## Verificación de Step 8A y pendientes

- QA local: se comprobaron la creación, edición y los cambios de estado de contactos y servicios. El acceso desde otra cuenta a un negocio ajeno devolvió 404.
- Rol miembro: la prueba SQL de Step 7 cubre lectura y denegación de escritura; no se probó la interfaz con una cuenta miembro real por el alcance acordado.
- Dependencias: Next.js 16.4.1; `npm audit --omit=dev` reportó 0 vulnerabilidades. El audit completo aún reporta 9 alertas altas en dependencias de desarrollo. No se ejecutó `npm audit fix --force`.
- Mensajes y pagos no forman parte de Step 8A; requieren proveedores y controles adicionales.