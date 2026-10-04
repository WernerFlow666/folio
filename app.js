
const books=[
{id:'arte',title:'El arte de aprender',author:'Guías Folio',category:'Educación',format:'TXT',symbol:'✳',file:'books/el-arte-de-aprender.txt',order:4},
{id:'codigo',title:'Pensar en código',author:'Guías Folio',category:'Tecnología',format:'TXT',symbol:'◈',file:'books/pensar-en-codigo.txt',order:3},
{id:'ciencia',title:'Una mirada a la ciencia',author:'Guías Folio',category:'Ciencias',format:'TXT',symbol:'◎',file:'books/una-mirada-a-la-ciencia.txt',order:2},
{id:'lineas',title:'Entre líneas',author:'Guías Folio',category:'Literatura',format:'TXT',symbol:'❋',file:'books/entre-lineas.txt',order:1}
];
let category='Todas',pending='';const $=s=>document.querySelector(s);
const favs=()=>JSON.parse(localStorage.getItem('folio-favs')||'[]');
const save=x=>localStorage.setItem('folio-favs',JSON.stringify(x));
function card(b){const f=favs().includes(b.id);return `<article class="card"><div class="cover"><span class="eyebrow">Guías Folio</span><span class="mark">${b.symbol}</span><b>${b.title}</b></div><div class="body"><div class="meta"><span class="tag">${b.format}</span><span class="tag">${b.category}</span></div><h3>${b.title}</h3><div class="author">${b.author}</div><div class="actions"><button class="btn primary download" data-file="${b.file}">Descargar</button><button class="btn secondary heart ${f?'active':''}" data-fav="${b.id}">${f?'♥':'♡'}</button></div></div></article>`}
function list(){const q=$('#search').value.trim().toLowerCase();let x=books.filter(b=>(category==='Todas'||b.category===category)&&(b.title.toLowerCase().includes(q)||b.author.toLowerCase().includes(q)));x.sort($('#sort').value==='az'?(a,b)=>a.title.localeCompare(b.title,'es'):(a,b)=>b.order-a.order);return x}
function bind(root){root.querySelectorAll('.download').forEach(b=>b.onclick=()=>{pending=b.dataset.file;$('#supportDialog').showModal()});root.querySelectorAll('[data-fav]').forEach(b=>b.onclick=()=>{const id=b.dataset.fav,a=favs();save(a.includes(id)?a.filter(x=>x!==id):[...a,id]);render()})}
function render(){const x=list();$('#bookGrid').innerHTML=x.map(card).join('');$('#count').textContent=`${x.length} ${x.length===1?'lectura':'lecturas'}`;$('#empty').style.display=x.length?'none':'block';const y=books.filter(b=>favs().includes(b.id));$('#favoritesGrid').innerHTML=y.map(card).join('');$('#favoritesEmpty').style.display=y.length?'none':'block';bind($('#bookGrid'));bind($('#favoritesGrid'))}
$('#search').addEventListener('input',render);$('#sort').addEventListener('change',render);document.querySelectorAll('.chip').forEach(c=>c.onclick=()=>{document.querySelectorAll('.chip').forEach(x=>x.classList.remove('active'));c.classList.add('active');category=c.dataset.category;render();$('#biblioteca').scrollIntoView()});
$('#closeDialog').onclick=()=>$('#supportDialog').close();$('#continueDownload').onclick=()=>{if(pending){const a=document.createElement('a');a.href=pending;a.download='';a.click()}$('#supportDialog').close()};render();
