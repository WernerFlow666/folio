# Folio

Repositorio digital de libros conectado a Supabase.

## Archivos
Todos los archivos se suben directamente a la raíz del repositorio.

## Funciones
- Catálogo público desde Supabase
- Búsqueda por título o autor
- Categorías
- Favoritos locales
- Descargas con aviso de colaboración
- Registro e inicio de sesión
- Panel privado de administrador
- Subida de PDF, EPUB y TXT a Supabase Storage
- Alta y eliminación de libros desde la web

## GitHub Pages
Settings → Pages → Deploy from a branch → main → / (root)

## Seguridad
La clave incluida en `app.js` es una publishable key de Supabase, diseñada para usarse en frontend.
La seguridad real está aplicada mediante Row Level Security (RLS) en Supabase.
No publiques service_role keys ni contraseñas en GitHub.


## Nueva experiencia de lectura
- Botón **Leer** para abrir PDF, EPUB o TXT dentro de Folio.
- El botón de descarga ahora muestra **Colabora con $1**.
- La confirmación de colaboración es manual en esta versión.
- Para hacer obligatorio y verificar automáticamente el pago, conecta una pasarela (PayPal/Stripe/etc.) y usa Storage privado + URLs firmadas.


## Flujo de colaboración y aprobación
1. El visitante puede leer el libro dentro de Folio.
2. Para solicitar la descarga debe iniciar sesión.
3. Selecciona método de colaboración e ingresa el número de comprobante/ID de transacción.
4. La solicitud aparece en el panel del administrador.
5. El administrador aprueba o rechaza.
6. Cuando está aprobada, el usuario puede descargar desde la misma ventana.

Los datos de Banco/PayPal se configuran desde el panel privado y se guardan en Supabase.


## Mejoras visuales
- Lector PDF propio con PDF.js, ajustado al ancho del celular y navegación página por página.
- Confirmaciones y avisos con SweetAlert2.
- Campo obligatorio para subir una portada JPG/PNG/WEBP.
- La portada real aparece en la tarjeta del libro.
- Al eliminar un libro también se elimina su portada de Supabase Storage.


## Nuevas mejoras
- Si subes un **PDF** sin portada manual, Folio toma automáticamente la **primera página del PDF** como portada del libro.
- En la solicitud de colaboración ahora también se exige **foto del comprobante**.
- En el panel de administrador aparece un botón **Ver comprobante** y una miniatura de la imagen.

## Importante
Antes de usar la foto del comprobante, ejecuta el archivo:

`MIGRACION_COMPROBANTES_FOTO.sql`

en **Supabase → SQL Editor**.


## Categorías ampliadas
Folio ahora incluye categorías como:
Literatura, Psicología, Autoayuda, Educación, Tecnología, Ciencias, Historia, Biografías, Finanzas, Negocios, Emprendimiento, Filosofía, Religión y espiritualidad, Salud y bienestar, Romance, Misterio y suspenso, Terror, Ciencia ficción, Fantasía, Juvenil, Infantil, Poesía, Arte y diseño, Derecho, Política y sociedad, Cocina, Viajes, Idiomas, Informática y Matemáticas.

## Lector PDF
- Zoom +
- Zoom -
- Ajustar al ancho
- Navegación anterior / siguiente

## Comprobantes
- Las imágenes del comprobante se guardan en un bucket privado.
- Solo el administrador puede abrirlas.
- Se visualizan en un modal moderno con enlace temporal firmado.


## Reparación estable
Esta versión corrige un error de JavaScript que podía ocultar la biblioteca y el panel de administración.
El archivo `app.js` fue validado sintácticamente antes de generar este paquete.

## Importador de Google Drive
El panel de administrador incluye contador de pendientes, importados, duplicados y errores; importación por lotes; reintento de errores; y generación automática de portada desde la primera página del PDF ya importado.

## Flyer
`flyer-colaboracion.png` aparece dentro de la ventana de colaboración.


## Edición de libros
En el panel de administrador, cada libro tiene un botón `Editar`.
Permite actualizar título, autor, categoría, descripción y portada.
El archivo del libro no se reemplaza desde esta edición.
