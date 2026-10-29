# Radar Auto Medellín — experiencia iPhone v3

Esta versión de Radar Auto moderniza la PWA existente. **El sistema no requiere cargar cotizaciones** para consultar las promociones; las cotizaciones de usuario son opcionales y se guardan localmente.

## Novedades de la experiencia

- Pantalla **Inicio**: Kicks 2020 como parte de pago, cuota objetivo y tres oportunidades para empezar.
- **Ofertas**: búsqueda, filtros táctiles (tasa 0 % integral, inicial, eléctricos/híbridos, guardadas), marca, vigencia y ordenación.
- Tarjetas con precio, modalidad y cuota simulada — distinguiendo condiciones publicadas de hipótesis financieras.
- **Comparar**: hasta tres vehículos, con saldo a financiar, interés, costo total estimado e inicial adicional.
- **Mi plan**: retoma estimada, venta particular, efectivo, cuota objetivo, plazo, tasa de referencia, seguros y gastos. Selección de vehículo y resultados inmediatos.
- **Radar**: estado del barrido, fuentes, concesionarios y forma de instalar en iPhone.
- Favoritos, comparaciones y parámetros de usuario persistidos en el navegador; interfaz responsive, navegación inferior y detalle como panel móvil.
- El rastreador programado y la estructura de GitHub Pages se conservaron sin cambios funcionales.

## Abrir una vista previa

Abrir `index.html` en navegador moderno. La vista previa en un archivo local **no ejecuta el rastreador automático** y puede tener límites de almacenamiento local. `index.html` es autocontenido y también se entrega aparte.

## Instalar en iPhone como app real

1. Crear o actualizar repositorio GitHub con la totalidad de estos archivos, manteniendo `index.html` en la raíz.
2. En GitHub, activar Actions y Pages para publicar con **GitHub Actions**. Revisar `Settings > Pages`, fuente `GitHub Actions`.
3. Ejecutar el flujo de `.github/workflows/monitor.yml` manualmente para generar la primera publicación. En ejecuciones posteriores se revisarán las fuentes según el cron configurado.
4. Abrir la URL pública HTTPS desde **Safari** del iPhone → Compartir → **Agregar a Inicio** → **Abrir como app web** → Agregar.
5. La app mantendrá el último catálogo visible en caché y buscará la versión publicada al conectarse. En algunas condiciones de iOS puede ser necesario volver a abrirla o pulsar actualizar para ver la nueva versión.

> El proyecto **no está desplegado por el simple hecho de descargar este ZIP**. Sin publicar GitHub Pages y activar Actions, la app no rastrea ofertas por sí sola.

## Mantenimiento

- `data/ofertas.json`: referencias editoriales iniciales. `data/fuentes_radar.json`: fuentes supervisadas por los robots.
- `monitor.py` y `radar.py`: rastreo, extracción, historial y señales de vigencia.
- `build.py`: inserta catálogo y monitor en `template.html`, junto con `site.css` y `app.js`, generando `index.html`.
- `.github/workflows/monitor.yml`: ejecutar rastreo, pruebas, compilar, publicar en GitHub Pages.
- `sw.js`, `manifest.webmanifest` e `icons/`: instalación PWA y caché; nueva versión de caché `radar-auto-pwa-v3`.
- `tests.py`: 7 pruebas del rastreador. Ejecutar `python -m unittest tests.py -v` y después `python build.py`.

Los cálculos financieros son **ilustrativos**. Una tasa 0 % publicada no se aplica en el simulador si falta la cuota inicial o si el anuncio está vencido o marcado para revisión. En ese caso se usa una tasa editable, identificada como hipótesis. Los beneficios que no tienen contrato legal o inventario verificado no constituyen oferta aprobada. La retoma de $58 M, la venta particular de $65 M y la cuota objetivo de $2,5 M son **supuestos iniciales editables**, no un avalúo ni un presupuesto confirmado.

## Datos y privacidad

Los parámetros del presupuesto, favoritos y comparaciones usan `localStorage` en el navegador; ninguna oferta personal es enviada al rastreador. Al eliminar los datos del sitio en Safari se borrarán estas preferencias. La PWA no tiene sincronización de cuenta entre dispositivos.
