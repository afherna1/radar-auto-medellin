"""Produce HTML autosuficiente; combina base editorial con campañas halladas por robots."""
import json
import datetime as dt
from zoneinfo import ZoneInfo
from pathlib import Path
p=Path(__file__).resolve().parent
base=json.loads((p/'data/ofertas.json').read_text(encoding='utf8'))
radar=p/'data/ofertas_detectadas.json'
if radar.exists():
    found=json.loads(radar.read_text(encoding='utf8'))
    base['radar_checked_at']=found.get('checked_at')
    base['offers']=found.get('offers',[])+base['offers']
else:
    base['radar_checked_at']=None
status=p/'data/monitor_status.json'
if status.exists():
    base['monitor_summary']=json.loads(status.read_text(encoding='utf8'))
for source in json.loads((p/'data/fuentes_radar.json').read_text(encoding='utf8')):
    url=source['url']
    if source.get('kind')=='monthly':
        date=dt.datetime.now(ZoneInfo('America/Bogota')).date()
        month=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'][date.month-1]
        url=url.format(month=month,year=date.year)
    if not any(s['url']==url for s in base['sources']):
        base['sources'].append({'name':source['name'],'url':url})
# Los datos personales de cotizaciones nunca se copian al catálogo generado.
h=(p/'template.html').read_text(encoding='utf8')
for name,content in {'__CSS__':(p/'site.css').read_text(encoding='utf8'),
                     '__JS__':(p/'app.js').read_text(encoding='utf8'),
                     '__SEED__':json.dumps(base,ensure_ascii=False).replace('</','<\\/')}.items():
    h=h.replace(name,content)
(p/'index.html').write_text(h,encoding='utf8')
print('Visor actualizado con',len(base['offers']),'oportunidades y fecha radar',base['radar_checked_at'])
