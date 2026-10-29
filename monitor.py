"""Compatibilidad: monitor.py ahora detecta promociones y alimenta el visor.
Ejecuta `python monitor.py`; el catálogo se reconstruye mediante `python build.py`.
"""
from radar import persist_scan
if __name__ == '__main__':
    result=persist_scan()
    print(f"Fuentes={len(result['items'])} campañas={result['offers_detected']} cambios={len(result['alerts'])} errores={result['errors']}")
