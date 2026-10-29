(()=>{'use strict';
const seed=JSON.parse(document.getElementById('seed').textContent);
const $=id=>document.getElementById(id);
const nf=new Intl.NumberFormat('es-CO',{maximumFractionDigits:2});
const money=n=>n===null||!Number.isFinite(n)?'Por confirmar':'$'+nf.format(n)+' M';
const monthly=n=>n===null||!Number.isFinite(n)?'Por confirmar':'$'+nf.format(n)+' M/mes';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const url=s=>{try{let u=new URL(s);return /^https?:$/.test(u.protocol)?u.href:'#'}catch{return '#'}};
const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const defaults={trade:58,sale:65,cash:0,target:2.5,months:36,rate:1.5,insurance:0,fees:0};
function stored(key,alt){try{return JSON.parse(localStorage.getItem('ra2_'+key))??alt}catch{return alt}}
function save(key,value){try{localStorage.setItem('ra2_'+key,JSON.stringify(value))}catch(_){}}
const legacyTrade=(()=>{try{return JSON.parse(localStorage.getItem('vcm_trade_v1'))||{}}catch{return {}}})();
const oldProfile={trade:legacyTrade.retoma,sale:legacyTrade.venta,cash:legacyTrade.efectivo,months:legacyTrade.plazo,insurance:legacyTrade.seguro,fees:legacyTrade.cargos};
Object.keys(oldProfile).forEach(k=>{if(oldProfile[k]===undefined)delete oldProfile[k]});
let profile={...defaults,...oldProfile,...stored('profile',{})};
const numericProfile=['trade','sale','cash','target','months','rate','insurance','fees'];
for(let k of numericProfile)if(!Number.isFinite(+profile[k])||+profile[k]<0)profile[k]=defaults[k];
const state={screen:'inicio',chip:'all',search:'',brand:'',sort:'smart',expired:false,compare:stored('compare',[]).slice(0,3),saved:stored('saved',[]),extras:stored('quotes',stored('legacy_quotes',[])),selected:stored('selected',(function(){try{return JSON.parse(localStorage.getItem('vcm_selected_v1'))||'tesla-model-y'}catch{return 'tesla-model-y'}})()),offers:seed.offers||[],dealers:seed.dealers||[],monitor:seed.monitor_summary||null};
const all=()=>state.offers.concat(state.extras);
const expired=o=>!!(o.valid_until&&o.valid_until<today)||o.reliability==='legal_vencido';
const questionable=o=>o.price_status==='referencia_vencida'||o.auto_stale||(o.auto&&o.reliability!=='legal_vigente_analizado');
const valid=o=>!expired(o)&&!questionable(o);
const knownPrice=o=>o.price!=null&&Number.isFinite(+o.price)&&+o.price>0;
const isPartial=o=>(o.scheme==='intro'||o.scheme==='grace')&&+o.intro_rate===0&&+o.intro_months>0;
const isFull=o=>o.scheme==='full_zero';
function method(o){if(expired(o))return ['Vencida','expired'];if(questionable(o)||o.scheme==='unverified_zero')return ['Por verificar','review'];if(isFull(o))return ['0 % hasta '+(o.max_months||36)+' meses','full'];if(isPartial(o))return ['0 % primeros '+o.intro_months+' meses','temp'];return ['Financiación a consultar','normal']}
function payment(balance,n,rpct){if(balance<=0||n<=0)return 0;let r=rpct/100;return r<1e-10?balance/n:balance*r/(1-(1+r)**-n)}
function forecast(o,pr=profile){if(!knownPrice(o))return null;
 let price=+o.price,trade=Math.max(0,Math.min(price,+pr.trade||0)),cash=Math.max(0,Math.min(price-trade,+pr.cash||0));
 let financed=Math.max(0,price-trade-cash),months=+pr.months||36,down=price?100*(trade+cash)/price:100;
 let min=+o.min_down_pct||0,missing=Math.max(0,price*min/100-trade-cash);
 let allowed=valid(o)&&missing<.00001;let full=allowed&&isFull(o)&&months<=+o.max_months;
 let intro=allowed&&isPartial(o),after=Math.max(0,+o.after_rate||0);
 if(!full&&!(o.scheme==='intro'&&o.after_rate>0))after=+pr.rate||0;
 // Las tasas no verificadas nunca se interpretan como tasa cero integral.
 if(!valid(o)||o.scheme==='unverified_zero'||(isFull(o)&&!full)){intro=false;full=false;after=+pr.rate||0}
 let bal=financed,interest=0,total=0,first=0,peak=0,post=0,rows=[];
 for(let i=1;i<=months;i++){
  let inIntro=intro&&i<=+o.intro_months;
  let rate=full?0:inIntro?0:after;
  let pay=(inIntro&&o.scheme==='grace')?0:payment(bal,months-i+1,rate);
  let charge=bal*rate/100;
  if(i===months)pay=bal+charge;
  bal=Math.max(0,bal-(pay-charge));
  interest+=charge;total+=pay;
  if(i===1)first=pay;
  if(pay>peak)peak=pay;
  if(i===Math.min(months,+(o.intro_months||0)+1))post=pay;
  rows.push({month:i,pay,charge,balance:bal});
 }
 let monthlyInsurance=+pr.insurance||0,fees=+pr.fees||0;
 let recurringPeak=peak+monthlyInsurance;
 return {price,trade,cash,financed,months,missing,down,min,full,intro,after,first,post,interest,total,peak,recurringPeak,rows,insurance:monthlyInsurance*months,fees,economicTotal:trade+cash+total+monthlyInsurance*months+fees,affordable:recurringPeak<=+pr.target&&missing<.001,assumed:!full&&(o.after_rate==null||!valid(o)||o.scheme==='unverified_zero'||(isFull(o)&&!full)),valid:valid(o)};
}
function badge(o){let [text,kind]=method(o);return `<span class="deal-badge ${kind==='temp'?'temp':kind==='full'?'':kind}">${esc(text)}</span>`}
function getOffer(id){return all().find(o=>o.id===id)}
function offerHtml(o){const f=forecast(o);let legal=questionable(o)?'Confirmar precio y condiciones':expired(o)?'Oferta vencida':'Ver condiciones';let availability=f?.missing>0?'Faltan '+money(f.missing)+' para la inicial':f?.affordable?'Dentro de tu cuota objetivo':'Revisar presupuesto / condiciones';let note=f?.assumed?'Tasa hipotética si falta confirmar':f?.full?'Tasa cero sujeta a aprobación':'Según campaña e hipótesis';
return `<article class="offer-card"><div class="offer-head"><span class="overline">${esc(o.brand)} · ${esc(o.fuel||'Vehículo')}</span><button class="save-btn ${state.saved.includes(o.id)?'saved':''}" type="button" data-save="${esc(o.id)}" aria-label="${state.saved.includes(o.id)?'Quitar de guardadas':'Guardar oferta'}" aria-pressed="${state.saved.includes(o.id)}">${state.saved.includes(o.id)?'♥':'♡'}</button></div><h3>${esc(o.model)}</h3><p class="fuel-label">${esc(o.type||'')} · ${esc(legal)}</p>${badge(o)}<div class="offer-price">${knownPrice(o)?money(+o.price):'Sin precio'} <small>${knownPrice(o)?'publicado desde':''}</small></div><p class="offer-benefit">${esc(o.benefit||'Consulta condiciones de la promoción.')}</p><div class="offer-pay"><div><span>Cuota mensual estimada*</span><strong>${f?money(f.recurringPeak):'—'}</strong><small>${f?esc(note):'Precio pendiente'}</small></div><div class="pay-alert">${f?esc(availability):'Necesita precio'}</div></div><div class="offer-actions"><button class="outline-btn" type="button" data-detail="${esc(o.id)}">Ver detalles</button><button class="solid-btn" type="button" data-compare="${esc(o.id)}">${state.compare.includes(o.id)?'✓ Elegida':'+ Comparar'}</button></div></article>`}
function filtered(){return all().filter(o=>{
 if(!state.expired&&(expired(o)||o.auto_stale))return false;
 if(state.brand&&state.brand!==o.brand)return false;
 if(state.search&&!(o.brand+' '+o.model+' '+o.benefit+' '+o.fuel+' '+o.type).toLowerCase().includes(state.search.toLowerCase()))return false;
 if(state.chip==='full'&&!isFull(o))return false;
 if(state.chip==='intro'&&!isPartial(o))return false;
 if(state.chip==='electric'&&!/el[eé]ctric|h[ií]brid/i.test(o.fuel||''))return false;
 if(state.chip==='saved'&&!state.saved.includes(o.id))return false;
 return true;
 }).sort((a,b)=>{
  if(state.sort==='price')return (a.price??Infinity)-(b.price??Infinity);
  if(state.sort==='payment')return (forecast(a)?.recurringPeak??Infinity)-(forecast(b)?.recurringPeak??Infinity);
  if(state.sort==='soon')return (a.valid_until||'9999').localeCompare(b.valid_until||'9999');
  let score=o=>((expired(o)?12:0)+(questionable(o)?5:0)+(isFull(o)?0:isPartial(o)?1.6:3)+(forecast(o)?.missing>0?2:0)+(knownPrice(o)?0:10)+(forecast(o)?.affordable?0:1));
  return score(a)-score(b)||(forecast(a)?.recurringPeak??Infinity)-(forecast(b)?.recurringPeak??Infinity);
 });}
function renderOffers(){const brands=[...new Set(all().map(o=>o.brand))].sort();$('brandFilter').innerHTML='<option value="">Todas las marcas</option>'+brands.map(b=>`<option value="${esc(b)}" ${b===state.brand?'selected':''}>${esc(b)}</option>`).join('');
 const found=filtered();$('resultsCount').textContent=found.length+' alternativas';$('offersGrid').innerHTML=found.length?found.map(offerHtml).join(''):`<div class="empty-state"><h3>No hay resultados con esos filtros</h3><p>Prueba otras marcas o condiciones. No es necesario subir cotizaciones.</p><button type="button" data-clear-filters>Ver todas las ofertas</button></div>`;
 document.querySelectorAll('.filter-chip').forEach(b=>{let active=b.dataset.chip===state.chip;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))});}
function renderHome(){ $('homeTrade').textContent=money(+profile.trade);$('homeBudget').textContent=money(+profile.target);$('totalOffers').textContent=all().length;$('totalZero').textContent=all().filter(o=>!expired(o)&&(isFull(o)||isPartial(o))).length;$('totalDealers').textContent=state.dealers.length;
 const list=all().filter(o=>knownPrice(o)&&!expired(o)&&o.price_status!=='referencia_vencida');
 const full=list.filter(isFull).sort((a,b)=>a.price-b.price)[0];
 const affordable=list.filter(o=>forecast(o)?.affordable).sort((a,b)=>forecast(a).recurringPeak-forecast(b).recurringPeak)[0];
 const cheapest=list.filter(o=>o.id!==full?.id&&o.id!==affordable?.id).sort((a,b)=>(forecast(a)?.recurringPeak??Infinity)-(forecast(b)?.recurringPeak??Infinity))[0];
 const picks=[{o:full,label:'01 · TASA CERO PUBLICADA',note:'Revisa el monto de inicial y los requisitos del crédito.'},{o:affordable&&affordable.id!==full?.id?affordable:cheapest,label:'02 · CERCA DE TU PRESUPUESTO',note:'Cuota calculada con tu Nissan Kicks como parte de pago.'},{o:cheapest&&cheapest.id!==(affordable&&affordable.id!==full?.id?affordable:cheapest)?.id?cheapest:list.filter(o=>o.id!==full?.id&&o.id!==affordable?.id).sort((a,b)=>a.price-b.price)[0],label:'03 · OTRA ALTERNATIVA',note:'Compara el costo total, no solo la promoción.'}];
 let unique=new Set();$('featuredGrid').innerHTML=picks.filter(x=>x.o&&!unique.has(x.o.id)&&unique.add(x.o.id)).map(x=>{let f=forecast(x.o);return `<article class="feature-card"><span class="feature-label">${esc(x.label)}</span>${badge(x.o)}<h3>${esc(x.o.brand)}</h3><div class="model">${esc(x.o.model)}</div><div class="feature-fig">${f?money(f.recurringPeak):'Sin precio'} <small>/mes estimados</small></div><p class="feature-note">${esc(x.note)} ${f?.missing>0?'Inicial pendiente: '+money(f.missing)+'. ':''}${f?.assumed?'Tasa hipotética.':''}</p><button type="button" data-detail="${esc(x.o.id)}">Revisar esta oferta <span>→</span></button></article>`}).join('')||'<div class="empty-state">Aún no hay ofertas con precio comprobable. Revisa el estado del radar.</div>';
 const checked=seed.radar_checked_at; $('statusLine').textContent=checked?'Último rastreo publicado: '+checked.replace('T',' ').slice(0,16)+' (COL). Revisar condiciones en fuentes.':'Catálogo de referencia · el rastreo automático no está activado en un servidor.';
 $('footerData').textContent=checked?'Revisión: '+checked.slice(0,10):'Catálogo inicial: '+seed.updated_at;
}
function renderCompare(){const opts=state.compare.map(getOffer).filter(Boolean);
 document.querySelectorAll('[data-compare-count]').forEach(el=>el.textContent=opts.length);
 $('clearCompare').disabled=!opts.length;
 if(!opts.length){$('compareContent').innerHTML='<div class="empty-state"><h3>Aún no elegiste vehículos</h3><p>En Explorar ofertas pulsa «+ Comparar» para añadir hasta tres opciones. Se conservarán aquí cuando vuelvas a abrir la app.</p><button data-switch="ofertas" type="button">Explorar ofertas →</button></div>';return;}
 $('compareContent').innerHTML=opts.map(o=>{const f=forecast(o);return `<article class="compare-card"><span class="overline">${esc(o.brand)}</span><h3>${esc(o.model)}</h3>${badge(o)}<div class="cmp-fig">${f?money(f.recurringPeak):'Sin precio'}<div class="muted" style="font-size:12px;font-weight:500;letter-spacing:0">Cuota mensual máxima estimada</div></div><div class="summary-list"><div><span>Precio publicado</span><strong>${money(knownPrice(o)?+o.price:null)}</strong></div><div><span>Saldo a financiar</span><strong>${money(f?.financed??null)}</strong></div><div><span>Intereses estimados</span><strong>${money(f?.interest??null)}</strong></div><div><span>Costo total* </span><strong>${money(f?.economicTotal??null)}</strong></div><div><span>Inicial adicional requerida</span><strong>${money(f?.missing??null)}</strong></div><div><span>Calidad</span><strong>${valid(o)?'Publicada, validar':'Por confirmar'}</strong></div></div><button class="remove-link" data-remove="${esc(o.id)}" type="button">Quitar de comparación</button></article>`}).join('')+'<div class="compare-legend">* Costo económico = retoma + efectivo + pagos del crédito, seguros indicados y gastos iniciales. Es una estimación; no agrega valores desconocidos ni garantiza una tasa de aprobación.</div>';
}
function renderPlan(){const fields={trade:'inputTrade',sale:'inputSale',cash:'inputCash',target:'inputTarget',months:'inputMonths',rate:'inputRate',insurance:'inputInsurance',fees:'inputFees'};
 for(let k in fields)if(document.activeElement!==$(fields[k]))$(fields[k]).value=profile[k];
 const options=all().map(o=>`<option value="${esc(o.id)}" ${state.selected===o.id?'selected':''}>${esc(o.brand+' · '+o.model)}</option>`).join('');
 $('planSelectedOffer').innerHTML=options;
 const o=getOffer(state.selected)||all()[0],f=o?forecast(o):null;
 $('planMonthly').textContent=f?monthly(f.recurringPeak):'Sin precio';
 $('planMonthlyNote').textContent=f?(f.assumed?'Cuota mensual máxima · tasa hipotética':'Cuota mensual máxima estimada'):'Se necesita un precio publicado para simular.';
 $('planScenario').innerHTML= !f?'<div><span>Estado</span><strong>Precio por confirmar</strong></div>':`<div><span>Precio publicado</span><strong>${money(f.price)}</strong></div><div><span>Retoma de tu Kicks</span><strong>${money(f.trade)}</strong></div><div><span>A financiar</span><strong>${money(f.financed)}</strong></div><div><span>Tu cuota objetivo</span><strong>${money(+profile.target)}</strong></div><div><span>¿Cumple tu presupuesto?</span><strong>${f.affordable?'Dentro del objetivo':'Revisar condiciones'}</strong></div><div><span>Inicial adicional para la oferta</span><strong>${money(f.missing)}</strong></div><div><span>Intereses estimados</span><strong>${money(f.interest)}</strong></div><div><span>Costo económico total*</span><strong>${money(f.economicTotal)}</strong></div><div><span>Plazo</span><strong>${f.months} meses</strong></div><div><span>Retoma vs. venta particular</span><strong>${money((+profile.sale)-(+profile.trade))}</strong></div>`;
}
function renderRadar(){const checked=seed.radar_checked_at,monitor=state.monitor;
 $('radarStatus').innerHTML=`<span class="signal"></span><div><strong>${checked?'Rastreo publicado':'El rastreo automático todavía no está activo aquí'}</strong><p>${checked?'Última revisión programada registrada: '+esc(checked.replace('T',' ').slice(0,16))+' (COL).':'Esta es una versión con datos iniciales. Para actualizarla automáticamente hay que publicarla en HTTPS con GitHub Actions y Pages.'}</p></div>`;
 const items=monitor?.items||[];$('monitorChecks').innerHTML=items.length?items.map(r=>`<div class="check-row"><div><strong>${esc(r.name)}</strong><small>${esc(r.message||'Fuente consultada')}</small></div><span class="${r.ok?'ok':'err'}">${r.ok?'✓':'Revisar'}</span></div>`).join(''):'<p class="muted">No hay comprobaciones programadas registradas todavía. El HTML descargado no rastrea páginas por su cuenta.</p>';
 $('sourceLinks').innerHTML=(seed.sources||[]).map(s=>`<a href="${esc(url(s.url))}" target="_blank" rel="noopener noreferrer">${esc(s.name)} ↗</a>`).join('');
 const brands=[...new Set(state.dealers.map(d=>d.brand))].sort();const selected=$('dealerFilter').value;$('dealerFilter').innerHTML='<option value="">Todas las marcas</option>'+brands.map(b=>`<option ${b===selected?'selected':''}>${esc(b)}</option>`).join('');renderDealers();}
function renderDealers(){let b=$('dealerFilter').value;$('dealerList').innerHTML=state.dealers.filter(x=>!b||x.brand===b).map(d=>`<article class="dealer-card"><small>${esc(d.brand)} · ${esc(d.city)}</small><h3>${esc(d.name)}</h3><p>${esc(d.address)}</p><a target="_blank" rel="noopener noreferrer" href="${esc(url(d.map))}">Ver ubicación ↗</a></article>`).join('')}
function navigate(tab){if(!['inicio','ofertas','comparar','plan','radar'].includes(tab))return;state.screen=tab;document.querySelectorAll('[data-screen]').forEach(el=>el.classList.toggle('hidden',el.dataset.screen!==tab));document.querySelectorAll('[data-switch]').forEach(b=>{b.classList.toggle('active',b.dataset.switch===tab);if(b.hasAttribute('aria-current'))b.removeAttribute('aria-current');if(b.dataset.switch===tab)b.setAttribute('aria-current','page')});document.querySelectorAll('[data-tab-link]').forEach(b=>b.classList.toggle('active',b.dataset.tabLink===tab));if(tab==='inicio')renderHome();if(tab==='ofertas')renderOffers();if(tab==='comparar')renderCompare();if(tab==='plan')renderPlan();if(tab==='radar')renderRadar();window.scrollTo({top:0,behavior:'instant'});}
let toastTimer;function toast(t){const el=$('toast');el.textContent=t;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),2300)}
function toggleCompare(id){if(state.compare.includes(id)){state.compare=state.compare.filter(x=>x!==id);toast('Vehículo retirado de la comparación')}else if(state.compare.length>=3){toast('Puedes comparar hasta 3 vehículos');navigate('comparar');return}else{state.compare.push(id);toast('Añadido a la comparación')}save('compare',state.compare);renderCompare();renderOffers();}
function modal(open,id){$('detailOverlay').classList.toggle('hidden',!open);document.body.style.overflow=open?'hidden':'';
 if(!open)return;const o=getOffer(id);if(!o)return;const f=forecast(o);$('detailBrand').textContent=o.brand+' · '+(o.fuel||'');$('detailBody').innerHTML=`<h2 id="detailTitle">${esc(o.model)}</h2>${badge(o)}<div class="detail-price">${money(knownPrice(o)?+o.price:null)}</div><p class="detail-text">${esc(o.benefit)}</p><div class="summary-list"><div><span>Cuota mensual estimada</span><strong>${money(f?.recurringPeak??null)}</strong></div><div><span>A financiar con tu Kicks</span><strong>${money(f?.financed??null)}</strong></div><div><span>Inicial adicional requerida</span><strong>${money(f?.missing??null)}</strong></div><div><span>Vigencia informada</span><strong>${esc(o.valid_until||'Sin confirmar')}</strong></div><div><span>Tasa usada en cálculo</span><strong>${f?.full?'0 % durante '+f.months+' meses':f?.assumed?'Hipótesis '+profile.rate+' % M.V.':'Promocional + posterior'}</strong></div></div><div class="detail-section"><strong>Condiciones publicadas</strong><p>${esc(o.terms||'Condiciones pendientes de confirmar.')}</p></div><div class="detail-section"><strong>Calidad de la información</strong><p>${expired(o)?'La vigencia del anuncio ya terminó. No se interpreta como una oferta actual.':questionable(o)?'Anuncio o precio pendiente de validación; no se presupone una tasa 0 % integral.':'Oferta publicada. Deben confirmarse inventario, versión, retoma y aprobación del crédito.'}</p><p>La simulación excluye seguros y gastos no ingresados y no equivale a una oferta bancaria.</p><p><a class="source-anchor" target="_blank" rel="noopener noreferrer" href="${esc(url(o.source))}">Ver publicación original ↗</a></p></div><div class="detail-actions"><button class="outline-btn" type="button" data-modal-compare="${esc(o.id)}">${state.compare.includes(o.id)?'Quitar de comparar':'Añadir a comparar'}</button><button class="solid-btn" type="button" data-modal-plan="${esc(o.id)}">Simular este carro →</button></div>`;
 $('detailClose').focus();}
function exportCSV(){let rows=[['Marca','Modelo','Precio (millones COP)','Modalidad','Inicio','Fin','Fuente'],...all().map(o=>[o.brand,o.model,o.price??'',method(o)[0],o.valid_from||'',o.valid_until||'',o.source||''])];let csv='\ufeff'+rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(';')).join('\r\n');const u=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=u;a.download='radar_auto_promociones.csv';a.click();setTimeout(()=>URL.revokeObjectURL(u),1200);toast('Catálogo exportado')}
function resetFilters(){state.chip='all';state.search='';state.brand='';state.sort='smart';state.expired=false;$('searchBox').value='';$('sortFilter').value='smart';$('includeExpired').checked=false;renderOffers()}
function profileChange(){const fields={trade:'inputTrade',sale:'inputSale',cash:'inputCash',target:'inputTarget',months:'inputMonths',rate:'inputRate',insurance:'inputInsurance',fees:'inputFees'};for(let key in fields){let v=Number($(fields[key]).value);if(Number.isFinite(v)&&v>=0)profile[key]=v;}if(profile.months<1)profile.months=36;save('profile',profile);renderPlan();}
function submitQuote(e){e.preventDefault();const d=new FormData(e.currentTarget);let brand=String(d.get('brand')||'').trim(),model=String(d.get('model')||'').trim(),price=Number(d.get('price'));if(!brand||!model||!Number.isFinite(price)||price<=0){toast('Revisa marca, modelo y precio');return}const extra={id:'user-'+Date.now(),brand,model,price,type:'Por confirmar',fuel:'Por confirmar',benefit:String(d.get('terms')||'Cotización aportada por el usuario'),terms:String(d.get('terms')||'Sin términos legales completos'),scheme:'standard',price_status:'cotizacion_usuario',valid_until:null,min_down_pct:0,source:String(d.get('source')||''),verified:'Cotización aportada por el usuario. Sin verificación independiente.'};state.extras.push(extra);save('quotes',state.extras);$('quoteOverlay').classList.add('hidden');document.body.style.overflow='';e.currentTarget.reset();state.chip='all';state.search='';toast('Cotización guardada solo en este dispositivo');navigate('ofertas')}
function setOnline(){const on=navigator.onLine;const p=$('netPill');p.classList.toggle('off',!on);p.textContent=on?(seed.radar_checked_at?'Último radar disponible':'Datos de referencia'):'Sin conexión';$('refreshBtn').disabled=!on;}
function events(){document.addEventListener('click',e=>{
 const sw=e.target.closest('[data-switch]');if(sw){e.preventDefault();if(sw.dataset.filterShortcut)state.chip=sw.dataset.filterShortcut;navigate(sw.dataset.switch);return}
 const tab=e.target.closest('[data-tab-link]');if(tab){e.preventDefault();navigate(tab.dataset.tabLink);return}
 const detail=e.target.closest('[data-detail]');if(detail){modal(true,detail.dataset.detail);return}
 const compare=e.target.closest('[data-compare]');if(compare){toggleCompare(compare.dataset.compare);return}
 const saved=e.target.closest('[data-save]');if(saved){let id=saved.dataset.save;state.saved=state.saved.includes(id)?state.saved.filter(x=>x!==id):[...state.saved,id];save('saved',state.saved);renderOffers();toast(state.saved.includes(id)?'Oferta guardada':'Oferta retirada');return}
 const rm=e.target.closest('[data-remove]');if(rm){toggleCompare(rm.dataset.remove);return}
 const cm=e.target.closest('[data-modal-compare]');if(cm){let id=cm.dataset.modalCompare;modal(false);toggleCompare(id);return}
 const mp=e.target.closest('[data-modal-plan]');if(mp){state.selected=mp.dataset.modalPlan;save('selected',state.selected);modal(false);navigate('plan');return}
 const clr=e.target.closest('[data-clear-filters]');if(clr){resetFilters();return}
 const chip=e.target.closest('[data-chip]');if(chip){state.chip=chip.dataset.chip;renderOffers();return}
 });
 $('searchBox').addEventListener('input',e=>{state.search=e.target.value.trim();renderOffers()});$('clearSearch').addEventListener('click',()=>{$('searchBox').value='';state.search='';renderOffers();$('searchBox').focus()});
 $('brandFilter').addEventListener('change',e=>{state.brand=e.target.value;renderOffers()});$('sortFilter').addEventListener('change',e=>{state.sort=e.target.value;renderOffers()});$('includeExpired').addEventListener('change',e=>{state.expired=e.target.checked;renderOffers()});$('resetFilters').addEventListener('click',resetFilters);
 $('planSelectedOffer').addEventListener('change',e=>{state.selected=e.target.value;save('selected',state.selected);renderPlan()});$('dealerFilter').addEventListener('change',renderDealers);$('exportOffers').addEventListener('click',exportCSV);
 $('clearCompare').addEventListener('click',()=>{state.compare=[];save('compare',[]);renderCompare();renderOffers();toast('Selección vaciada')});
 $('resetPlan').addEventListener('click',()=>{profile={...defaults};save('profile',profile);renderPlan();toast('Se restauraron valores de ejemplo')});
 $('profileForm').addEventListener('input',profileChange);$('profileForm').addEventListener('submit',e=>e.preventDefault());
 $('refreshBtn').addEventListener('click',()=>location.reload());$('radarRefresh').addEventListener('click',()=>location.reload());
 $('detailClose').addEventListener('click',()=>modal(false));$('detailOverlay').addEventListener('click',e=>{if(e.target===$('detailOverlay'))modal(false)});
 $('quoteOpen').addEventListener('click',()=>{$('quoteOverlay').classList.remove('hidden');document.body.style.overflow='hidden'});$('quoteClose').addEventListener('click',()=>{$('quoteOverlay').classList.add('hidden');document.body.style.overflow=''});$('quoteOverlay').addEventListener('click',e=>{if(e.target===$('quoteOverlay')){$('quoteOverlay').classList.add('hidden');document.body.style.overflow=''}});$('quoteForm').addEventListener('submit',submitQuote);
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){modal(false);$('quoteOverlay').classList.add('hidden');document.body.style.overflow=''}});
 window.addEventListener('online',setOnline);window.addEventListener('offline',setOnline);
}
function init(){events();setOnline();renderPlan();renderHome();renderOffers();renderCompare();renderRadar();
 const h=location.hash.replace('#','');if(['inicio','ofertas','comparar','plan','radar'].includes(h))navigate(h);
 if('serviceWorker' in navigator&&(location.protocol==='https:'||['localhost','127.0.0.1'].includes(location.hostname)))window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(()=>{}));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
