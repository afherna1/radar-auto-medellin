"""Extracción prudente de campañas automotrices publicadas en sitios públicos.

No requiere datos personales ni cotizaciones. El valor financiero se calcula únicamente
con datos inequívocos; avisos sin términos completos NO son 'cero por todo el plazo'.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import re
import unicodedata
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Callable
from urllib.parse import urljoin, urlparse
from zoneinfo import ZoneInfo

from bs4 import BeautifulSoup
import requests

ROOT = Path(__file__).resolve().parent
TIMEZONE = ZoneInfo('America/Bogota')
KEY_TERMS = re.compile(r'(?:promoci[oó]n|financia|inter[eé]s|\bbono\b|descuento|tasas?|cr[eé]dito|\bcuotas?\b|precio|\bdesde\b|\b0\s?%)', re.I)
ZERO = re.compile(r'(?<![\d,])0(?:[.,]0+)?\s?%', re.I)
RATE = re.compile(r'\b(?:tasa|inter[eé]s)[^.\n:]{0,55}?\b(?:desde|del|de)?\s*0\s?%', re.I)
PERCENT = re.compile(r'(\d{1,2})\s*%')
MONTHS = re.compile(r'(?:plazo(?: del cr[eé]dito)?\s*:?[\s\S]{0,30}?|hasta\s+)(\d{1,2})\s*mes(?:es)?', re.I)
PRICE = re.compile(r'(?:\bdesde\s*|\bprecio(?:\s+(?:de|sugerido))?\s*(?:de|:|es)?\s*)\$\s*((?:\d{1,3}\.){1,3}\d{3}|\d{7,9})', re.I)
DATE_NAMED = re.compile(r'\b(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+(?:de\s+|del\s+)?(20\d\d)', re.I)
DATE_SLASH = re.compile(r'(?<!\d)([0-3]?\d)[/\-]([01]?\d)[/\-](20\d\d)\b')
MONTH_LOOKUP = {'enero':1,'febrero':2,'marzo':3,'abril':4,'mayo':5,'junio':6,'julio':7,'agosto':8,'septiembre':9,'setiembre':9,'octubre':10,'noviembre':11,'diciembre':12}
BLOCKED = re.compile(r'\b(?:captcha|access denied|enable javascript|just a moment|cloudflare)\b', re.I)
MODELS = ['Sonic 2027', 'Captiva EV 2026', 'Captiva PHEV 2026', 'Spark EUV 2026', 'Onix 2027', 'Tracker 2027']


def today(): return dt.datetime.now(TIMEZONE).date()
def timestamp(): return dt.datetime.now(TIMEZONE).isoformat(timespec='seconds')
def compact(s): return re.sub(r'\s+', ' ', s or '').strip()
def norm(s):
    s = unicodedata.normalize('NFKD', str(s)).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+','-',s).strip('-')
def stable_id(brand, label, url):
    return 'auto-'+norm(brand)+'-'+norm(label)[:55]+'-'+hashlib.sha256(url.encode()).hexdigest()[:7]

def fetch_url(url):
    response = requests.get(url,timeout=(10,25),headers={
        'User-Agent':'Mozilla/5.0 (compatible; RadarAutoMedellin/2.0; verificacion de ofertas publicas)',
        'Accept-Language':'es-CO,es;q=0.9', 'Accept':'text/html,application/xhtml+xml'})
    response.raise_for_status()
    if len(response.content) > 3_000_000: raise ValueError('HTML demasiado grande')
    if 'html' not in response.headers.get('Content-Type','html').lower(): raise ValueError('No es una página HTML')
    return response.text

def soup_of(html):
    soup = BeautifulSoup(html,'html.parser')
    for el in soup.select('script,style,nav,footer,header,form,svg,noscript,iframe'):
        el.decompose()
    return soup

def parts_of(html):
    soup = soup_of(html)
    parts = []
    seen=set()
    for el in soup.select('h1,h2,h3,h4,h5,p,li,td'):
        # No se incluye texto de contenedores anidados para evitar duplicidad.
        if el.find_parent(['li','td']) and el.name not in ['li','td']: continue
        line=compact(el.get_text(' ',strip=True))
        if not 8 <= len(line) <= 5000 or line in seen: continue
        seen.add(line)
        parts.append((el.name,line))
    return parts

def extract_expiry(text, now=None):
    """Busca fin de vigencia explícito: NUNCA infiere futuro solo por nombre del mes."""
    now=now or today()
    # Preferir sentencias que mencionen vigencia, válido, solicitudes, hasta.
    sentences=re.split(r'(?<=[.\n])\s+|(?<=;)\s+',text)
    valid_sentences=[s for s in sentences if re.search(r'v[áa]lid|vigencia|solicitudes|hasta el|entre el',s,re.I)]
    found=[]
    for s in valid_sentences:
        for d,m,y in DATE_NAMED.findall(s):
            try:found.append(dt.date(int(y),MONTH_LOOKUP[m.lower()],int(d)))
            except ValueError: pass
        for d,m,y in DATE_SLASH.findall(s):
            try:found.append(dt.date(int(y),int(m),int(d)))
            except ValueError:pass
    if found:
        near=[x for x in found if x.year>=now.year-1 and x.year<=now.year+2]
        return max(near).isoformat() if near else None
    return None

def extract_money(text):
    m=PRICE.search(text)
    if not m:return None
    digits=re.sub(r'\D','',m.group(1))
    v=int(digits)
    return round(v/1e6,3) if 30_000_000<=v<=1_000_000_000 else None

def snippet(t,n=760):return compact(t)[:n]

def make_offer(source, model, description, url, legal_text='', *, discovered_at=None, terms_url=None, expiry=None, down=None, n_months=None, price=None, tentative_zero=False):
    """La financiación solo se marca 'full_zero' si la letra pequeña no está vencida y confirma TODO el plazo."""
    checked=(discovered_at or timestamp())
    fin_text=compact(legal_text)
    desc=compact(description)
    expiry=expiry or extract_expiry(fin_text) or extract_expiry(desc)
    expired=bool(expiry and expiry < checked[:10])
    financing_claim = bool(ZERO.search(desc)) or tentative_zero
    legal_zero=bool(ZERO.search(fin_text))
    n_months=n_months or 0
    min_down=down or 0
    # Únicamente después de leer términos específicos y validez.
    whole_term = bool(re.search(r'(?:tasa\s+(?:de\s+inter[eé]s\s+)?fija\s+(?:desde\s+)?0\s?%|5\s*a[nñ]os\s+sin\s+intereses|0\s?%\s+por\s+toda\s+la\s+vida)',fin_text,re.I))
    restricted = bool(re.search(r'primeros?\s+\w*\s*(?:\d+|seis|doce)\s+mes(?:es)?|a\s+partir\s+del\s+mes\s+7',fin_text,re.I))
    full_zero=bool(legal_zero and whole_term and not restricted and n_months and expiry and not expired)
    if full_zero:
        scheme='full_zero'
        after_rate=0
        reliability='legal_vigente_analizado' if expiry else 'legal_sin_fecha_confirmada'
    elif financing_claim or legal_zero:
        scheme='unverified_zero'
        after_rate=None
        reliability='legal_vencido' if expired else 'condiciones_incompletas'
    else:
        scheme='standard';after_rate=None
        reliability='legal_vencido' if expired else 'promocion_detectada'
    benefit=('Tasa 0 % por '+str(n_months)+' meses: '+('legales publicados, revisar' if full_zero else 'por validar')+' · ' if financing_claim or legal_zero else '')+snippet(desc,170)
    return {
        'id':stable_id(source['brand'],model,url), 'brand':source['brand'], 'model':model,
        'type':'SUV' if bool(re.search('SUV|Cross|Captiva|Tracker|Kicks|Sonet|Sportage|Duster|Sonic',model,re.I)) else 'Sedán',
        'fuel':'Sin precisar', 'price':price if price is not None else extract_money(desc),
        'price_status':'vigente' if price is not None or extract_money(desc) is not None else 'sin_cotizar',
        'benefit':benefit,'scheme':scheme, 'intro_months':0,'intro_rate':0,
        'after_rate':after_rate,'max_months':n_months or None,'min_down_pct':min_down,
        'valid_until':expiry, 'bonus':0,'terms':snippet(fin_text or desc,780),
        'source':terms_url or url,'landing_url':url,'source_name':source.get('name',source.get('brand','Sin fuente')),'detected_at':checked,'auto':True,
        'reliability':reliability,'verified':{
            'legal_vigente_analizado':'Lectura automática de condiciones explícitas; aplicabilidad sujeta a banco, inventario y aprobación.',
            'legal_sin_fecha_confirmada':'Letra pequeña recuperada sin vigencia inequívoca; confirmar fecha.',
            'legal_vencido':'ATENCIÓN: el documento legal consultado está vencido, aunque el anuncio siga visible.',
            'condiciones_incompletas':'La tasa 0 % se anuncia, pero no se verificó su aplicación durante todo el plazo.',
            'promocion_detectada':'Campaña identificada automáticamente, condiciones por confirmar.'
        }[reliability],
        'evidence':{'claim':snippet(desc,380),'legal':snippet(fin_text,780),'legal_url':terms_url or None},
    }


def discover_kia_page(index_html,base,now=None):
    now=now or today()
    soup=soup_of(index_html)
    month=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'][now.month-1]
    target=norm('legales-campanas-'+month+'-'+str(now.year))
    found=[]
    for a in soup.select('a[href]'):
        h=a.get('href','')
        txt=norm(a.get_text(' ',strip=True))
        if target in norm(h) or target in txt:
            found.append(urljoin(base,h))
    # Probar primer enlace perteneciente al mes correcto (si está disponible).
    return found[0] if found else None


def extract_kia(source, html, url, *, checked=None):
    parts=parts_of(html)
    offers=[]
    items=[]
    headings=[]
    model_pat=re.compile(r'^(?:Kia\s+|New Kia\s+|The All-new\s+)?(Picanto|Soluto|K3\s+Sed[aá]n|K3\s+Cross|Sonet|Seltos|Sportage|Tasman|EV[23569]|Stonic|Rio|Niro|Carens|Sorento|Carnival)',re.I)
    for tag,line in parts:
        if tag.startswith('h') and model_pat.search(line) and len(line)<90:
            if items:headings.append(items)
            items=[line]
        elif items:
            items.append(line)
    if items:headings.append(items)
    for segment in headings:
        name=segment[0]; desc=' '.join(segment[1:])
        if not KEY_TERMS.search(desc):continue
        lines=[x for x in segment[1:] if KEY_TERMS.search(x)]
        if not lines:continue
        terms=' '.join(lines)
        expiry=extract_expiry(desc)
        # T&C globales suelen estar al final de la página.
        page_tail=' '.join(x for _,x in parts[-8:])
        expiry=expiry or extract_expiry(page_tail)
        # Detectar el periodo del beneficio, SIN suponer que sea todo el crédito.
        n=6 if re.search(r'primeros\s+6\s+meses|primeros\s+seis\s+meses',terms,re.I) else None
        o=make_offer(source,name,desc[:700],url,legal_text=terms,expiry=expiry,n_months=n,discovered_at=checked)
        # 0% inicial publicado no puede convertirse en 0% todo el crédito.
        if n and ZERO.search(terms):
            o.update(scheme='intro',intro_months=n,intro_rate=0,after_rate=None,
                     max_months=72,min_down_pct=30,
                     reliability='financiacion_temporal',verified='0 % solamente al inicio; tasa posterior por perfil y seguros por confirmar.')
        offers.append(o)
    return offers


def gm_segments(html):
    # Textos en tarjetas GM Financial; la misma familia aparece en varios planes.
    soup=soup_of(html)
    text=compact(soup.get_text(' ',strip=True))
    pattern=re.compile(r'\b('+('|'.join(re.escape(x) for x in MODELS))+r')\b',re.I)
    matches=list(pattern.finditer(text))
    results=[]
    for i,match in enumerate(matches):
        start=match.start()
        end=matches[i+1].start() if i+1<len(matches) else min(len(text),start+450)
        desc=text[start:min(end,start+550)]
        if KEY_TERMS.search(desc):results.append((match.group(1),desc))
    return results


def extract_gm(source,html,url,legal_pages:dict[str,tuple[str,str]], *, checked=None):
    out=[]
    for model,desc in gm_segments(html):
        name=model.lower()
        terms_url,legal=legal_pages.get('sonic' if 'sonic' in name else 'full36',('', ''))
        # Ofertas con tasa inicial de 12 meses tienen sus propios términos: nunca atribuirles el plan completo.
        promo_is_short=bool(re.search(r'plazo\s+tasa\s+beneficio\s*:?\s*12\s*meses|cuota\s+13',desc,re.I))
        if promo_is_short:
            terms_url,legal=('','')
        pctmatch=re.search(r'cuota\s+inicial\s+desde\s+(\d+)\s*%',desc,re.I)
        down=int(pctmatch.group(1)) if pctmatch else None
        m=MONTHS.search(desc)
        n=int(m.group(1)) if m else None
        o=make_offer(source,model,desc,url,legal_text=legal,terms_url=terms_url,
                     down=down,n_months=n,discovered_at=checked,
                     tentative_zero=bool(ZERO.search(desc)))
        if promo_is_short:
            o.update(scheme='intro',intro_months=12,intro_rate=0,after_rate=None,
                     max_months=60,reliability='condiciones_incompletas',
                     verified='0 % inicial de 12 meses según anuncio; tasa desde la cuota 13 pendiente de confirmar.')
        # El anuncio de 0 % de GM no puede permanecer activo si los T&C vencieron.
        if o['reliability']=='legal_vencido':o['benefit']='LEGAL VENCIDO · '+o['benefit']
        # En caso de múltiples planes para mismo modelo, usar IDs distintos.
        o['id']=stable_id(source['brand'],model+('-intro' if promo_is_short else '-full'),url)
        if len(desc)>20:out.append(o)
    return out


def extract_generic(source,html,url,*,checked=None):
    parts=parts_of(html)
    # Extraer titulares/secciones con sustancia comercial; no afirmar modelos ni tasas sin soporte.
    groups=[]; section=[]
    for tag,line in parts:
        if tag.startswith('h') and len(line)<130:
            if section:groups.append(section)
            section=[line]
        elif section and len(section)<10:
            section.append(line)
    if section:groups.append(section)
    out=[]
    for section in groups:
        title=section[0]
        if len(title)<6 or bool(re.search(r't[eé]rminos|cookies|privacidad|s[ií]guenos|conoce|sobre nosotros',title,re.I)):continue
        text=' '.join(section[1:])
        strong=bool(re.search(r'(?i)\b(?:tasa|bono|descuento|\d+\s*%|financiaci[oó]n|promoci[oó]n|precio\s+de|desde\s+\$)\b',text))
        if not strong or not KEY_TERMS.search(text):continue
        if len(text)<45:continue
        # Si no hay un modelo identificable, se publicará como pista documental, nunca como tasa comprobada.
        o=make_offer(source,title, text[:850], url,legal_text='',discovered_at=checked)
        o['type']='Sin clasificar';o['price_status']='sin_cotizar' if o['price'] is None else o['price_status']
        out.append(o)
    return out[:10]


def dedup(offers):
    d={}
    for o in offers:
        # No esconder planes distintos ni eliminar automáticamente la referencia anterior.
        key=o['id']
        if key not in d or len(str(o.get('evidence',{})))>len(str(d[key].get('evidence',{}))):d[key]=o
    return list(d.values())


def extract_price(source,html,url):
    """Precio referencial público desde página oficial de un modelo.
    No supone precio final, bono ni aprobación de concesionario.
    """
    label=source.get('model')
    if not label: return None
    soup=soup_of(html)
    text=compact(soup.get_text(' ',strip=True))
    money=re.findall(r'\$\s*((?:\d{1,3}\.){2,3}\d{3}|\d{7,9})',text)
    values=[]
    for x in money:
        n=int(re.sub(r'\D','',x))
        if 45_000_000<=n<=450_000_000:values.append(n/1e6)
    return (source['brand'],norm(label),min(values),url) if values else None


def scan(sources,fetch:Callable=fetch_url,checked=None):
    checked=checked or timestamp()
    results=[];status=[];prices=[]
    for source in sources:
        url=source['url'];name=source['name'];working=url
        if source.get('kind')=='monthly':
            d=dt.date.fromisoformat(checked[:10])
            mon=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'][d.month-1]
            url=url.format(month=mon,year=d.year)
            working=url
        try:
            html=fetch(url)
            if BLOCKED.search(compact(soup_of(html).get_text(' ',strip=True))[:300]):raise ValueError('Bloqueo de acceso; no se publican ofertas nuevas')
            if source.get('kind')=='price':
                price_info=extract_price(source,html,working)
                if not price_info:raise ValueError('No se encontró precio público legible para el modelo')
                prices.append(price_info);offers=[]
            elif source.get('kind')=='kia':
                current_url=discover_kia_page(html,url,dt.date.fromisoformat(checked[:10]))
                if not current_url:raise ValueError('No se encontró una página de campañas del mes actual')
                working=current_url; html=fetch(current_url)
                offers=extract_kia(source,html,working,checked=checked)
            elif source.get('kind')=='gm':
                legal={}
                for typ,turl in source.get('legal_urls',{}).items():
                    try:legal[typ]=(turl,compact(soup_of(fetch(turl)).get_text(' ',strip=True)))
                    except Exception as e:legal[typ]=('', '')
                offers=extract_gm(source,html,working,legal,checked=checked)
            else:
                offers=extract_generic(source,html,working,checked=checked)
            if not offers and source.get('kind')!='price': raise ValueError('Página accesible; extractor sin campañas identificables')
            results.extend(offers)
            status.append({'name':name,'url':working,'ok':True,'message':f'{len(offers)} ofertas o pistas extraídas','offers_found':len(offers)})
        except (requests.RequestException,ValueError,TypeError,KeyError) as ex:
            status.append({'name':name,'url':working,'ok':False,'message':f'{type(ex).__name__}: {str(ex)[:150]}','offers_found':0})
    for item in results:
        if item.get('price') is not None:continue
        label=norm(item['model'])
        for brand,model,price,url in prices:
            # Precios de versiones distintas nunca se copian sin que el modelo coincida.
            if item['brand']==brand and (model in label or label in model):
                item['price']=price;item['price_status']='referencia_por_verificar'
                item['price_source']=url
                item['verified']+=' Precio referencial de la página oficial del modelo; confirmar versión.'
                break
    return dedup(results),status


def persist_scan(root=ROOT,fetch=fetch_url,checked=None):
    root=Path(root); checked=checked or timestamp()
    src=json.loads((root/'data'/'fuentes_radar.json').read_text(encoding='utf8'))
    dest=root/'data'/'ofertas_detectadas.json';hist=root/'data'/'historial_cambios.json'
    old=json.loads(dest.read_text(encoding='utf8')) if dest.exists() else {'offers':[]}
    older={x['id']:x for x in old.get('offers',[])}
    fetched,status=scan(src,fetch,checked)
    # Si la fuente cae, mantener sus ofertas previas como desactualizadas, NO fingir confirmación.
    ok_sources={x['name'] for x in status if x['ok']}
    known_sources={x['name'] for x in src}
    new={x['id']:x for x in fetched}
    for item in older.values():
        if item['id'] not in new:
            was_ok=item.get('source_name') in ok_sources
            copy=dict(item)
            copy['reliability']='retirada_o_no_encontrada' if was_ok else 'fuente_no_disponible'
            copy['verified']='No se detecta actualmente en fuente' if was_ok else 'La fuente no respondió; última evidencia antigua'
            copy['auto_stale']=True
            new[copy['id']]=copy
    events=[]
    for uid,o in new.items():
        prev=older.get(uid)
        if not prev:events.append({'tipo':'nueva','modelo':o['brand']+' '+o['model'],'fuente':o['landing_url']})
        else:
            # Comparamos campos comerciales, no timestamps para evitar alertas falsas.
            commercial=['price','scheme','max_months','intro_months','after_rate','min_down_pct','valid_until','reliability','benefit','terms']
            if any(prev.get(k)!=o.get(k) for k in commercial):events.append({'tipo':'modificada','modelo':o['brand']+' '+o['model'],'fuente':o['landing_url']})
    out={'checked_at':checked,'offers':sorted(new.values(),key=lambda x:(x.get('auto_stale',False),x['brand'],x['model']))}
    dest.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    earlier=json.loads(hist.read_text(encoding='utf8')) if hist.exists() else []
    # No alerta por establecimiento de línea base.
    history=earlier+([{'fecha':checked,'eventos':events}] if old.get('checked_at') and events else [])
    hist.write_text(json.dumps(history[-120:],ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    result={'checked_at':checked,'items':status,'alerts':events if old.get('checked_at') else [],
            'offers_detected':len(fetched),'offers_catalogued':len(out['offers']),
            'errors':sum(not x['ok'] for x in status),'first_run':not bool(old.get('checked_at'))}
    (root/'data'/'monitor_status.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    notes=[f'# Radar automático — {checked}','',f'Fuentes consultadas: {len(status)}; ofertas detectadas: {len(fetched)}; errores: {result["errors"]}.',
           '', '**IMPORTANTE:** el rastreador es un sistema de descubrimiento y contraste documental; aprobación crediticia, inventario y retoma no están confirmados.','']
    if not result['alerts']:notes.append('No hay cambios comerciales alertables (o es la primera ejecución).')
    for e in result['alerts']:
        notes += ['',f'- **{e["tipo"]}**: {e["modelo"]} — {e["fuente"]}']
    (root/'data'/'ULTIMOS_CAMBIOS.md').write_text('\n'.join(notes)+'\n',encoding='utf8')
    return result

if __name__=='__main__':
    o=persist_scan()
    print(f'Revisadas {len(o["items"])} fuentes; detectadas {o["offers_detected"]} ofertas; fallaron {o["errors"]} fuentes; cambios {len(o["alerts"])}')
