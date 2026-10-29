"""Tests offline de detección y lectura de letra pequeña: python -m unittest tests.py"""
import datetime as dt
import unittest
import tempfile
import json
from pathlib import Path
from radar import discover_kia_page,extract_kia,extract_gm,extract_expiry,make_offer,scan,persist_scan,extract_price
T='2026-10-27T07:00:00-05:00'
GM_LEGAL='''<h1>Tasa desde 0% por 5 años</h1><p>El plan 5 años sin intereses aplica a Sonic. Cuota inicial del 50% del valor del vehículo; plazo del crédito: 60 meses y tasa de interés fija desde 0% n.m.v. (0% E.A). Válido para solicitudes hasta el 30 de septiembre de 2026.</p>'''
GM_PROMOS='''<html><body><div>SONIC 2027 Cuota inicial desde 50% Plazo del crédito: 60 meses. Tasa de interés desde 0% N.M.V</div><div>ONIX 2027 Cuota inicial desde 50% Plazo del crédito: 60 meses. Tasa desde 0% N.M.V Plazo tasa beneficio: 12 meses Tasa de interés perfil: Desde la cuota 13</div></body></html>'''
KIA='''<main><h2>Kia K3 Cross</h2><p>El precio de $78.990.000 aplica a Vibrant.</p><p>T&C tasa desde 0% con Finandina durante los primeros 6 meses, luego tasa vigente. Vigencia del 1 al 31 de octubre de 2026.</p><h2>Kia Sonet</h2><p>Precio de $88.990.000 aplica al modelo 2027.</p></main>'''
class RadarTests(unittest.TestCase):
 def test_expiry(self):
  self.assertEqual(extract_expiry('Válido hasta el 30 de septiembre de 2026',dt.date(2026,10,27)),'2026-09-30')
 def test_discover_current_month(self):
  x='<a href="/noticias/legales-campanas-octubre-2026">Legales campañas octubre 2026</a>'
  self.assertEqual(discover_kia_page(x,'https://kia.com.co/noticias',dt.date(2026,10,27)),'https://kia.com.co/noticias/legales-campanas-octubre-2026')
 def test_gm_expired_not_valid_zero(self):
  s={'name':'GM','brand':'Chevrolet'}
  a=extract_gm(s,GM_PROMOS,'https://gmfinancial.com/promos',{'sonic':('https://gmfinancial.com/legal',GM_LEGAL)},checked=T)
  sonic=next(x for x in a if x['model'].lower().startswith('sonic'))
  self.assertEqual(sonic['reliability'],'legal_vencido')
  self.assertNotEqual(sonic['scheme'],'full_zero')
  self.assertEqual(sonic['valid_until'],'2026-09-30')
  onix=next(x for x in a if x['model'].lower().startswith('onix'))
  self.assertEqual(onix['scheme'],'intro')
  self.assertEqual(onix['intro_months'],12)
 def test_kia_is_intro_not_full_zero(self):
  a=extract_kia({'brand':'Kia'},KIA,'https://kia.com.co/oct',checked=T)
  cross=next(x for x in a if 'Cross' in x['model'])
  self.assertEqual(cross['scheme'],'intro')
  self.assertEqual(cross['intro_months'],6)
  self.assertEqual(cross['price'],78.99)
 def test_do_not_promote_zero_without_legal(self):
  s={'brand':'BYD'}
  o=make_offer(s,'Yuan Plus','0% durante 36 meses','https://byd.co/',discovered_at=T)
  self.assertNotEqual(o['scheme'],'full_zero')
 def test_official_model_price(self):
  x={'brand':'Chevrolet','model':'Sonic 2027'}
  value=extract_price(x,'<main><h1>Sonic 2027</h1><p>Precio sugerido Premier: $87.990.000, RS: $92.990.000</p></main>','https://test.co/sonic')
  self.assertAlmostEqual(value[2],87.99)
 def test_automatic_cycle_and_alerts(self):
  with tempfile.TemporaryDirectory() as path:
   root=Path(path);(root/'data').mkdir()
   src=[{'name':'Kia','brand':'Kia','kind':'kia','url':'https://kia.test/noticias'}]
   (root/'data/fuentes_radar.json').write_text(json.dumps(src))
   pages={'https://kia.test/noticias':'<a href="/noticias/legales-campanas-octubre-2026">Legales campañas octubre 2026</a>',
          'https://kia.test/noticias/legales-campanas-octubre-2026':KIA}
   fetch=lambda url:pages[url]
   first=persist_scan(root,fetch,checked=T)
   self.assertGreater(first['offers_detected'],0)
   self.assertEqual(len(first['alerts']),0)
   self.assertTrue((root/'data/ofertas_detectadas.json').exists())
   second=persist_scan(root,fetch,checked='2026-10-28T07:00:00-05:00')
   self.assertEqual(len(second['alerts']),0)
   pages['https://kia.test/noticias/legales-campanas-octubre-2026']=KIA.replace('$78.990.000','$76.990.000')
   third=persist_scan(root,fetch,checked='2026-10-29T07:00:00-05:00')
   self.assertGreater(len(third['alerts']),0)
   offers=json.loads((root/'data/ofertas_detectadas.json').read_text())['offers']
   cross=next(x for x in offers if 'Cross' in x['model'])
   self.assertAlmostEqual(cross['price'],76.99)
if __name__=='__main__':unittest.main()
