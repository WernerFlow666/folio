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
