import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs";
pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";

const SUPABASE_URL = "https://objfdwsmqpzafnjxanij.supabase.co";
const SUPABASE_KEY = "sb_publishable_Q7oN05HWL-idjP-Eadzeuw_KHnFCvgg";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

let books = [];
let category = "Todas";
let pending = "";
let pendingBookId = "";
let session = null;
let siteSettings = null;
let isAdmin = false;

const $ = s => document.querySelector(s);
const favs = () => JSON.parse(localStorage.getItem("folio-favs") || "[]");
const saveFavs = x => localStorage.setItem("folio-favs", JSON.stringify(x));

function safeFileName(name="archivo"){ return name.replace(/[^a-zA-Z0-9._-]/g,"_"); }

async function blobToJpeg(blob, quality=0.92){
  const img = await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = reject;
    image.src = url;
  });
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img,0,0);
  return await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
}

async function extractPdfCoverBlob(file){
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({data: buffer}).promise;
  const page = await pdf.getPage(1);
  const baseViewport = page.getViewport({scale:1});
  const targetWidth = 900;
  const scale = targetWidth / baseViewport.width;
  const viewport = page.getViewport({scale});
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({canvasContext: ctx, viewport}).promise;
  return await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.92));
}

async function uploadCoverFromBlob(blob, baseName="cover.jpg"){
  const clean = safeFileName(baseName);
  const path = `${crypto.randomUUID()}-${clean}`;
  const {error} = await supabase.storage.from("covers").upload(path, blob, {upsert:false, contentType:"image/jpeg"});
  if(error) throw error;
  const {data} = supabase.storage.from("covers").getPublicUrl(path);
  return {path, url: data.publicUrl};
}

function escapeHtml(v=""){
  return String(v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
}

function symbolFor(category){
  const map={
    "Educación":"✳","Tecnología":"◈","Ciencias":"◎","Literatura":"❋","Psicología":"◌",
    "Autoayuda":"✦","Historia":"⌛","Biografías":"◍","Finanzas":"$","Negocios":"◆",
    "Emprendimiento":"↗","Filosofía":"∞","Religión y espiritualidad":"☼","Salud y bienestar":"✚",
    "Romance":"♡","Misterio y suspenso":"?","Terror":"☾","Ciencia ficción":"⌁","Fantasía":"✧",
    "Juvenil":"★","Infantil":"☁","Poesía":"❞","Arte y diseño":"✎","Derecho":"⚖",
    "Política y sociedad":"◫","Cocina":"♨","Viajes":"⌖","Idiomas":"A","Informática":"</>",
    "Matemáticas":"∑"
  };
  return map[category] || "✦";
}

function card(b){
  const f = favs().includes(b.id);
  const coverStyle = b.cover_url ? `style="background-image:linear-gradient(rgba(20,25,20,.25),rgba(20,25,20,.25)),url('${escapeHtml(b.cover_url)}');color:white"` : "";
  return `<article class="card">
    <div class="cover" ${coverStyle}>
      <span class="eyebrow">Folio</span>
      <span class="mark">${symbolFor(b.category)}</span>
      <b>${escapeHtml(b.title)}</b>
    </div>
    <div class="body">
      <div class="meta"><span class="tag">${escapeHtml(b.format)}</span><span class="tag">${escapeHtml(b.category)}</span></div>
      <h3>${escapeHtml(b.title)}</h3>
      <div class="author">${escapeHtml(b.author)}</div>
      ${b.description ? `<div class="desc">${escapeHtml(b.description)}</div>` : ""}
      <div class="actions">
        <button class="btn secondary readBook" data-id="${b.id}">Leer</button>
        <button class="btn primary download" data-book-id="${b.id}" data-file="${escapeHtml(b.file_url || "")}">Colaborar y descargar</button>
        <button class="btn secondary heart ${f?"active":""}" data-fav="${b.id}">${f?"♥":"♡"}</button>
      </div>
    </div>
  </article>`;
}

function filtered(){
  const q = $("#search").value.trim().toLowerCase();
  let x = books.filter(b =>
    (category === "Todas" || b.category === category) &&
    (`${b.title} ${b.author}`.toLowerCase().includes(q))
  );
  if($("#sort").value === "az") x.sort((a,b)=>a.title.localeCompare(b.title,"es"));
  else x.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  return x;
}

function bindCards(root){
  root.querySelectorAll(".readBook").forEach(btn => btn.onclick = () => {
    const book = books.find(x => x.id === btn.dataset.id);
    if(book) openReader(book);
  });

  root.querySelectorAll(".download").forEach(btn => btn.onclick = async () => {
    const book = books.find(x => x.id === btn.closest(".card")?.querySelector("[data-id]")?.dataset?.id);
    pending = btn.dataset.file;
    pendingBookId = btn.dataset.bookId || "";
    $("#paymentReference").value = "";
    $("#paymentMethod").value = "";
    $("#approvedDownload").classList.add("hidden");
    $("#contributionState").textContent = "";
    await loadContributionForPendingBook();
    $("#supportDialog").showModal();
  });

  root.querySelectorAll("[data-fav]").forEach(btn => btn.onclick = () => {
    const id = btn.dataset.fav;
    const a = favs();
    saveFavs(a.includes(id) ? a.filter(x=>x!==id) : [...a,id]);
    render();
  });
}

function render(){
  const x = filtered();
  $("#bookGrid").innerHTML = x.map(card).join("");
  $("#count").textContent = `${x.length} ${x.length===1?"lectura":"lecturas"}`;
  $("#empty").style.display = x.length ? "none" : "block";

  const y = books.filter(b => favs().includes(b.id));
  $("#favoritesGrid").innerHTML = y.map(card).join("");
  $("#favoritesEmpty").style.display = y.length ? "none" : "block";

  bindCards($("#bookGrid"));
  bindCards($("#favoritesGrid"));
  renderAdminList();
}

async function loadBooks(){
  const {data,error} = await supabase.from("books").select("*").order("created_at",{ascending:false});
  if(error){
    $("#count").textContent = "No se pudo cargar la biblioteca";
    console.error(error);
    return;
  }
  books = data || [];
  render();
}

async function checkAdmin(){
  if(!session?.user){
    isAdmin = false;
    updateAdminUI();
    return;
  }
  const {data,error} = await supabase.from("admins").select("user_id").eq("user_id", session.user.id).maybeSingle();
  isAdmin = !error && !!data;
  updateAdminUI();
  if(isAdmin){ await loadSiteSettings(); await loadAdminContributions(); await loadDriveQueue(); }
}

function updateAdminUI(){
  const logged = !!session?.user;
  $("#admin")?.classList.toggle("hidden", !logged);
  $("#adminNav")?.classList.toggle("hidden", !logged);
  $("#claimBox")?.classList.toggle("hidden", !logged || isAdmin);
  $("#uploadForm")?.classList.toggle("hidden", !logged || !isAdmin);
  $("#adminBooks")?.classList.toggle("hidden", !logged || !isAdmin);
  $("#paymentSettingsBox")?.classList.toggle("hidden", !logged || !isAdmin);
  $("#contributionsAdminBox")?.classList.toggle("hidden", !logged || !isAdmin);
  $("#driveImporterBox")?.classList.toggle("hidden", !logged || !isAdmin);
  if($("#authBtn")) $("#authBtn").textContent = logged ? "✓" : "WO";
}

async function renderAdminList(){
  if(!isAdmin || !$("#adminBookList")) return;
  $("#adminBookList").innerHTML = books.length ? books.map(b => `
    <div class="adminrow">
      <div><strong>${escapeHtml(b.title)}</strong><small>${escapeHtml(b.author)} · ${escapeHtml(b.format)}</small></div>
      <button class="btn danger deleteBook" data-id="${b.id}" data-path="${escapeHtml(b.file_path || "")}" data-cover-path="${escapeHtml(b.cover_path || "")}" data-url="${escapeHtml(b.file_url || "")}">Eliminar</button>
    </div>`).join("") : "<p>No hay libros todavía.</p>";

  document.querySelectorAll(".deleteBook").forEach(btn => btn.onclick = async () => {
    const result = await Swal.fire({
      icon:"warning",
      title:"¿Eliminar este libro?",
      text:"También se eliminarán el archivo y la portada almacenados.",
      showCancelButton:true,
      confirmButtonText:"Sí, eliminar",
      cancelButtonText:"Cancelar",
      reverseButtons:true
    });
    if(!result.isConfirmed) return;

    const id = btn.dataset.id;
    const path = btn.dataset.path;
    const coverPath = btn.dataset.coverPath;

    if(path) await supabase.storage.from("books").remove([path]);
    if(coverPath) await supabase.storage.from("covers").remove([coverPath]);

    const {error} = await supabase.from("books").delete().eq("id",id);
    if(error){
      await Swal.fire({icon:"error",title:"No se pudo eliminar",text:error.message});
      return;
    }

    await Swal.fire({icon:"success",title:"Libro eliminado",timer:1200,showConfirmButton:false});
    await loadBooks();
  });
}

$("#search")?.addEventListener("input",render);
$("#sort")?.addEventListener("change",render);

document.querySelectorAll("button.chip").forEach(c => c.onclick = () => {
  document.querySelectorAll("button.chip").forEach(x=>x.classList.remove("active"));
  c.classList.add("active");
  category = c.dataset.category;
  render();
  $("#biblioteca").scrollIntoView({behavior:"smooth"});
});

$("#categoryQuickFilter")?.addEventListener("change", e => {
  if(!e.target.value) return;
  document.querySelectorAll("button.chip").forEach(x=>x.classList.remove("active"));
  category = e.target.value;
  render();
  $("#biblioteca").scrollIntoView({behavior:"smooth"});
});

if($("#closeDialog")) $("#closeDialog").onclick = () => $("#supportDialog")?.close();

async function loadSiteSettings(){
  const {data,error} = await supabase.from("site_settings").select("*").eq("id",1).maybeSingle();
  if(error || !data) return;
  siteSettings = data;
  $("#bankLabel").textContent = data.bank_label || "Banco";
  $("#bankInstructions").textContent = data.bank_instructions || "";
  $("#paypalLabel").textContent = data.paypal_label || "PayPal";
  $("#paymentNote").textContent = data.payment_note || "Colaboración sugerida: $1";
  if(data.paypal_url){
    $("#paypalLink").href = data.paypal_url;
    $("#paypalLink").classList.remove("hidden");
  }else{
    $("#paypalLink").classList.add("hidden");
  }

  if(isAdmin){
    $("#settingsBankLabel").value = data.bank_label || "";
    $("#settingsBankInstructions").value = data.bank_instructions || "";
    $("#settingsPaypalLabel").value = data.paypal_label || "";
    $("#settingsPaypalUrl").value = data.paypal_url || "";
    $("#settingsPaymentNote").value = data.payment_note || "";
  }
}

async function loadContributionForPendingBook(){
  if(!session?.user){
    $("#contributionState").textContent = "Debes iniciar sesión antes de enviar un comprobante.";
    return;
  }
  if(!pendingBookId) return;

  const {data,error} = await supabase
    .from("contributions")
    .select("*")
    .eq("book_id", pendingBookId)
    .eq("user_id", session.user.id)
    .order("created_at",{ascending:false})
    .limit(1);

  if(error || !data?.length) return;
  const c = data[0];
  if(c.status === "approved"){
    $("#contributionState").textContent = "✅ Tu colaboración fue aprobada. Ya puedes descargar.";
    $("#approvedDownload").classList.remove("hidden");
  }else if(c.status === "rejected"){
    $("#contributionState").textContent = "❌ La solicitud fue rechazada. Puedes enviar un nuevo comprobante.";
  }else{
    $("#contributionState").textContent = "⏳ Tu comprobante está pendiente de revisión.";
  }
}

$("#contributionForm").addEventListener("submit", async e => {
  e.preventDefault();
  if(!session?.user){
    $("#contributionState").textContent = "Primero inicia sesión desde el botón WO.";
    return;
  }
  if(!pendingBookId) return;

  const method = $("#paymentMethod").value;
  const ref = $("#paymentReference").value.trim();
  const receiptFile = $("#receiptImage").files[0];

  if(!method || ref.length < 3){
    $("#contributionState").textContent = "Completa el método y el número de comprobante.";
    return;
  }
  if(!receiptFile){
    $("#contributionState").textContent = "Debes subir la foto del comprobante.";
    return;
  }

  $("#contributionState").textContent = "Subiendo comprobante...";
  const receiptPath = `${session.user.id}/${crypto.randomUUID()}-${safeFileName(receiptFile.name)}`;

  const {error:receiptError} = await supabase.storage.from("receipts").upload(receiptPath, receiptFile, {upsert:false});
  if(receiptError){
    $("#contributionState").textContent = receiptError.message;
    return;
  }

  const {error} = await supabase.from("contributions").insert({
    book_id: pendingBookId,
    user_id: session.user.id,
    payment_method: method,
    payment_reference: ref,
    payment_receipt_path: receiptPath
  });

  if(error){
    await supabase.storage.from("receipts").remove([receiptPath]);
    $("#contributionState").textContent = error.message;
    return;
  }

  $("#contributionForm").reset();
  $("#contributionState").textContent = "⏳ Comprobante enviado. Espera la aprobación del administrador.";
  await Swal.fire({icon:"success",title:"Comprobante enviado",text:"Tu solicitud quedó pendiente de revisión.",confirmButtonText:"Entendido"});
  await loadAdminContributions();
});

$("#approvedDownload").onclick = async () => {
  if(!session?.user || !pendingBookId) return;
  const {data,error} = await supabase
    .from("contributions")
    .select("status")
    .eq("book_id", pendingBookId)
    .eq("user_id", session.user.id)
    .eq("status","approved")
    .limit(1);

  if(error || !data?.length){
    $("#contributionState").textContent = "La descarga todavía no está aprobada.";
    return;
  }

  if(pending){
    const a=document.createElement("a");
    a.href=pending;
    a.target="_blank";
    a.rel="noopener";
    a.download="";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
};

async function loadAdminContributions(){
  if(!isAdmin) return;
  const {data,error} = await supabase
    .from("contributions")
    .select("id,book_id,user_id,payment_method,payment_reference,payment_receipt_path,status,created_at,reviewed_at,books(title)")
    .order("created_at",{ascending:false});

  if(error){
    $("#contributionsAdminList").innerHTML = `<p>${escapeHtml(error.message)}</p>`;
    return;
  }

  $("#contributionsAdminList").innerHTML = (data || []).length ? data.map(c => `
    <div class="contribution-admin-row">
      <div class="contribution-info">
        <strong>${escapeHtml(c.books?.title || "Libro")}</strong>
        <small>${escapeHtml(c.payment_method)} · Ref: ${escapeHtml(c.payment_reference)}</small>
        <small>${new Date(c.created_at).toLocaleString("es")}</small>
        <span class="status-pill status-${escapeHtml(c.status)}">${escapeHtml(c.status)}</span>
      </div>
      <div class="contribution-proof">
        ${c.payment_receipt_path ? `<button class="btn secondary viewReceipt" data-path="${escapeHtml(c.payment_receipt_path)}" data-title="${escapeHtml(c.books?.title || "Libro")}">Ver comprobante</button>` : `<small>Sin imagen</small>`}
      </div>
      <div class="review-actions">
        ${c.status === "pending" ? `
          <button class="btn primary approveContribution" data-id="${c.id}">Aprobar</button>
          <button class="btn danger rejectContribution" data-id="${c.id}">Rechazar</button>` : ""}
      </div>
    </div>`).join("") : "<p>No hay solicitudes todavía.</p>";

  document.querySelectorAll(".approveContribution").forEach(btn => btn.onclick = () => reviewContribution(btn.dataset.id,"approved"));
  document.querySelectorAll(".rejectContribution").forEach(btn => btn.onclick = () => reviewContribution(btn.dataset.id,"rejected"));

  document.querySelectorAll(".viewReceipt").forEach(btn => btn.onclick = async () => {
    const path = btn.dataset.path;
    const title = btn.dataset.title || "Comprobante";
    const {data,error} = await supabase.storage.from("receipts").createSignedUrl(path, 300);
    if(error){
      await Swal.fire({icon:"error",title:"No se pudo abrir el comprobante",text:error.message});
      return;
    }
    $("#receiptModalTitle").textContent = title;
    $("#receiptModalImage").src = data.signedUrl;
    $("#receiptDialog").showModal();
  });
}

async function reviewContribution(id,status){
  const {error} = await supabase
    .from("contributions")
    .update({status, reviewed_at:new Date().toISOString()})
    .eq("id",id);

  if(error){ await Swal.fire({icon:"error",title:"No se pudo completar",text:error.message}); return; }
  await Swal.fire({icon:"success",title:status === "approved" ? "Solicitud aprobada" : "Solicitud rechazada",timer:1200,showConfirmButton:false});
  await loadAdminContributions();
}

$("#savePaymentSettings").onclick = async () => {
  if(!isAdmin) return;
  $("#paymentSettingsStatus").textContent = "Guardando...";
  const payload = {
    bank_label: $("#settingsBankLabel").value.trim(),
    bank_instructions: $("#settingsBankInstructions").value.trim(),
    paypal_label: $("#settingsPaypalLabel").value.trim(),
    paypal_url: $("#settingsPaypalUrl").value.trim() || null,
    payment_note: $("#settingsPaymentNote").value.trim(),
    updated_at: new Date().toISOString()
  };
  const {error} = await supabase.from("site_settings").update(payload).eq("id",1);
  $("#paymentSettingsStatus").textContent = error ? error.message : "Datos de colaboración actualizados.";
  if(!error) await loadSiteSettings();
};


async function loadDriveQueue(){
  if(!isAdmin || !$("#driveImporterBox")) return;

  const {data,error} = await supabase
    .from("drive_import_queue")
    .select("id,drive_file_id,drive_title,status,duplicate_reason,created_at,updated_at")
    .order("created_at",{ascending:true});

  if(error){
    $("#driveQueuePreview").innerHTML = `<p class="status">${escapeHtml(error.message)}</p>`;
    return;
  }

  const rows = data || [];
  const counts = {pending:0, imported:0, skipped_duplicate:0, error:0};
  rows.forEach(r => { if(r.status in counts) counts[r.status]++; });

  $("#statPending").textContent = counts.pending;
  $("#statImported").textContent = counts.imported;
  $("#statSkipped").textContent = counts.skipped_duplicate;
  $("#statErrors").textContent = counts.error;

  const preview = rows.filter(r => r.status === "pending").slice(0,8);
  $("#driveQueuePreview").innerHTML = preview.length ? preview.map(r => `
    <div class="queue-row">
      <span class="queue-icon">PDF</span>
      <div>
        <strong>${escapeHtml(r.drive_title)}</strong>
        <small>Pendiente</small>
      </div>
    </div>`).join("") : `<p class="status">No hay archivos pendientes.</p>`;
}

async function createImportedCover(book){
  if(!book?.id || !book?.file_url || book.cover_url) return;
  try{
    const response = await fetch(book.file_url);
    if(!response.ok) return;
    const blob = await response.blob();
    const file = new File([blob], `${book.title || "libro"}.pdf`, {type:"application/pdf"});
    const coverBlob = await extractPdfCoverBlob(file);
    const uploaded = await uploadCoverFromBlob(coverBlob, `${book.title || "libro"}-cover.jpg`);
    await supabase.from("books").update({
      cover_path: uploaded.path,
      cover_url: uploaded.url
    }).eq("id",book.id);
  }catch(err){
    console.warn("No se pudo generar portada automática:", err);
  }
}

async function importOneDriveItem(item){
  const {data,error} = await supabase.functions.invoke("import-drive-pdf", {
    body: {
      drive_file_id: item.drive_file_id,
      drive_title: item.drive_title
    }
  });

  if(error) throw error;
  if(data?.error) throw new Error(data.error);

  if(data?.imported){
    await createImportedCover(data.imported);
    return {type:"imported", title:data.imported.title || item.drive_title};
  }

  if(data?.skipped){
    return {type:"skipped", title:data.title || item.drive_title};
  }

  return {type:"unknown", title:item.drive_title};
}

async function importDriveBatch(){
  if(!isAdmin) return;

  const batchSize = Number($("#driveBatchSize")?.value || 5);
  const {data,error} = await supabase
    .from("drive_import_queue")
    .select("id,drive_file_id,drive_title,status")
    .eq("status","pending")
    .order("created_at",{ascending:true})
    .limit(batchSize);

  if(error){
    await Swal.fire({icon:"error",title:"No se pudo cargar la cola",text:error.message});
    return;
  }

  if(!data?.length){
    await Swal.fire({icon:"info",title:"No hay libros pendientes",text:"La cola de importación está vacía."});
    await loadDriveQueue();
    return;
  }

  $("#driveImportProgress")?.classList.remove("hidden");
  $("#importDriveBatch").disabled = true;
  const results = [];

  for(let i=0;i<data.length;i++){
    const item = data[i];
    $("#driveImportBar").style.width = `${Math.round((i/data.length)*100)}%`;
    $("#driveImportStatus").textContent = `Importando ${i+1} de ${data.length}: ${item.drive_title}`;

    try{
      const result = await importOneDriveItem(item);
      results.push(result);
    }catch(err){
      results.push({type:"error",title:item.drive_title,error:err?.message || String(err)});
    }

    await loadDriveQueue();
  }

  $("#driveImportBar").style.width = "100%";
  $("#driveImportStatus").textContent = "Lote terminado.";
  $("#importDriveBatch").disabled = false;

  const imported = results.filter(x=>x.type==="imported").length;
  const skipped = results.filter(x=>x.type==="skipped").length;
  const errors = results.filter(x=>x.type==="error");

  await loadBooks();
  await loadDriveQueue();

  if(errors.length){
    await Swal.fire({
      icon:"warning",
      title:"Lote terminado con avisos",
      html:`<b>${imported}</b> importados · <b>${skipped}</b> omitidos · <b>${errors.length}</b> con error.<br><br>${escapeHtml(errors[0].error || "")}`,
      confirmButtonText:"Entendido"
    });
  }else{
    await Swal.fire({
      icon:"success",
      title:"Lote importado",
      text:`${imported} libro(s) importado(s) y ${skipped} duplicado(s) omitido(s).`,
      confirmButtonText:"Listo"
    });
  }
}

$("#importDriveBatch")?.addEventListener("click", importDriveBatch);
$("#refreshDriveQueue")?.addEventListener("click", loadDriveQueue);

$("#retryDriveErrors")?.addEventListener("click", async () => {
  if(!isAdmin) return;
  const result = await Swal.fire({
    icon:"question",
    title:"¿Reintentar errores?",
    text:"Los archivos con error volverán a la cola de pendientes.",
    showCancelButton:true,
    confirmButtonText:"Sí, reintentar",
    cancelButtonText:"Cancelar"
  });
  if(!result.isConfirmed) return;

  const {error} = await supabase
    .from("drive_import_queue")
    .update({status:"pending",duplicate_reason:null,updated_at:new Date().toISOString()})
    .eq("status","error");

  if(error){
    await Swal.fire({icon:"error",title:"No se pudo actualizar",text:error.message});
    return;
  }

  await loadDriveQueue();
  await Swal.fire({icon:"success",title:"Errores devueltos a la cola",timer:1300,showConfirmButton:false});
});

let pdfDoc = null;
let pdfPage = 1;
let pdfRendering = false;
let pdfZoom = 1;
let epubBook = null;
let epubRendition = null;

async function openReader(book){
  const dialog = $("#readerDialog");
  const content = $("#readerContent");
  $("#readerTitle").textContent = book.title;
  content.innerHTML = '<p class="reader-loading">Cargando lectura...</p>';
  dialog.showModal();

  const url = book.file_url;
  const format = (book.format || "").toUpperCase();

  try{
    if(format === "PDF"){
      content.innerHTML = `
        <div class="pdf-reader-shell">
          <div class="pdf-toolbar">
            <button class="btn secondary" id="pdfPrev">←</button>
            <span id="pdfPageInfo">Página 1</span>
            <button class="btn secondary" id="pdfNext">→</button>
            <span class="pdf-toolbar-sep"></span>
            <button class="btn secondary" id="pdfZoomOut">−</button>
            <span id="pdfZoomInfo">100%</span>
            <button class="btn secondary" id="pdfZoomIn">+</button>
            <button class="btn secondary" id="pdfFit">Ajustar</button>
          </div>
          <div class="pdf-canvas-wrap"><canvas id="pdfCanvas"></canvas></div>
        </div>`;
      pdfDoc = await pdfjsLib.getDocument(url).promise;
      pdfPage = 1;
      pdfZoom = 1;

      async function renderPdfPage(num){
        if(pdfRendering) return;
        pdfRendering = true;
        try{
          const page = await pdfDoc.getPage(num);
          const canvas = $("#pdfCanvas");
          const ctx = canvas.getContext("2d");
          const wrap = canvas.parentElement;
          const baseViewport = page.getViewport({scale:1});
          const fitWidth = Math.max(280, Math.min(wrap.clientWidth - 24, 900));
          const fitScale = fitWidth / baseViewport.width;
          const viewport = page.getViewport({scale:fitScale * pdfZoom});
          const ratio = window.devicePixelRatio || 1;

          canvas.width = Math.floor(viewport.width * ratio);
          canvas.height = Math.floor(viewport.height * ratio);
          canvas.style.width = `${viewport.width}px`;
          canvas.style.height = `${viewport.height}px`;

          await page.render({
            canvasContext: ctx,
            viewport,
            transform: ratio !== 1 ? [ratio,0,0,ratio,0,0] : null
          }).promise;

          $("#pdfPageInfo").textContent = `Página ${num} de ${pdfDoc.numPages}`;
          $("#pdfZoomInfo").textContent = `${Math.round(pdfZoom*100)}%`;
          $("#pdfPrev").disabled = num <= 1;
          $("#pdfNext").disabled = num >= pdfDoc.numPages;
        }finally{
          pdfRendering = false;
        }
      }

      $("#pdfPrev").onclick = async () => {
        if(pdfPage <= 1) return;
        pdfPage -= 1;
        await renderPdfPage(pdfPage);
      };
      $("#pdfNext").onclick = async () => {
        if(pdfPage >= pdfDoc.numPages) return;
        pdfPage += 1;
        await renderPdfPage(pdfPage);
      };
      $("#pdfZoomIn").onclick = async () => {
        pdfZoom = Math.min(2.5, +(pdfZoom + 0.15).toFixed(2));
        await renderPdfPage(pdfPage);
      };
      $("#pdfZoomOut").onclick = async () => {
        pdfZoom = Math.max(0.6, +(pdfZoom - 0.15).toFixed(2));
        await renderPdfPage(pdfPage);
      };
      $("#pdfFit").onclick = async () => {
        pdfZoom = 1;
        await renderPdfPage(pdfPage);
      };

      await renderPdfPage(pdfPage);
      return;
    }

    if(format === "TXT"){
      const response = await fetch(url);
      if(!response.ok) throw new Error("No se pudo abrir el archivo.");
      const text = await response.text();
      content.innerHTML = `<pre class="txt-reader">${escapeHtml(text)}</pre>`;
      return;
    }

    if(format === "EPUB"){
      if(typeof window.ePub !== "function") throw new Error("El lector EPUB no pudo cargarse.");
      content.innerHTML = `
        <div class="epub-toolbar">
          <button class="btn secondary" id="epubPrev">← Anterior</button>
          <button class="btn secondary" id="epubNext">Siguiente →</button>
        </div>
        <div id="epubViewer" class="epub-viewer"></div>`;
      epubBook = window.ePub(url);
      epubRendition = epubBook.renderTo("epubViewer", {width:"100%", height:"100%"});
      await epubRendition.display();
      $("#epubPrev").onclick = () => epubRendition.prev();
      $("#epubNext").onclick = () => epubRendition.next();
      return;
    }

    throw new Error("Formato no compatible con el lector.");
  }catch(err){
    content.innerHTML = `<div class="reader-error"><h3>No se pudo abrir este libro</h3><p>${escapeHtml(err.message || "Error desconocido")}</p></div>`;
  }
}

$("#closeReader").onclick = () => {
  pdfDoc = null;
  pdfPage = 1;
  pdfZoom = 1;
  if(epubRendition){ try{ epubRendition.destroy(); }catch{} }
  if(epubBook){ try{ epubBook.destroy(); }catch{} }
  epubRendition = null;
  epubBook = null;
  $("#readerContent").innerHTML = "";
  $("#readerDialog").close();
};

$("#authBtn").onclick = () => {
  if(session?.user) document.querySelector("#admin").scrollIntoView({behavior:"smooth"});
  else $("#authDialog").showModal();
};
$("#closeAuth").onclick = () => $("#authDialog").close();

$("#authForm").addEventListener("submit", async e => {
  e.preventDefault();
  $("#authStatus").textContent = "Ingresando...";
  const email=$("#email").value.trim();
  const password=$("#password").value;
  const {error}=await supabase.auth.signInWithPassword({email,password});
  if(error) return $("#authStatus").textContent=error.message;
  $("#authStatus").textContent="";
  $("#authDialog").close();
});

$("#signupBtn").onclick = async () => {
  const email=$("#email").value.trim();
  const password=$("#password").value;
  if(!email || password.length<6) return $("#authStatus").textContent="Escribe un correo y una contraseña de mínimo 6 caracteres.";
  $("#authStatus").textContent="Creando cuenta...";
  const {data,error}=await supabase.auth.signUp({email,password});
  if(error) return $("#authStatus").textContent=error.message;
  $("#authStatus").textContent = data.session ? "Cuenta creada." : "Cuenta creada. Revisa tu correo para confirmarla y luego inicia sesión.";
};

$("#logoutBtn").onclick = async () => {
  await supabase.auth.signOut();
};

$("#claimBtn").onclick = async () => {
  const code=$("#claimCode").value.trim();
  if(!code) return $("#claimStatus").textContent="Escribe el código de activación.";
  $("#claimStatus").textContent="Activando...";
  const {error}=await supabase.rpc("claim_admin",{p_code:code});
  if(error) return $("#claimStatus").textContent=error.message;
  $("#claimCode").value="";
  $("#claimStatus").textContent="Administrador activado.";
  await checkAdmin();
};

$("#uploadForm").addEventListener("submit", async e => {
  e.preventDefault();
  if(!isAdmin) return;

  const file=$("#file").files[0];
  const cover=$("#coverFile").files[0] || null;
  if(!file) return;

  const ext=(file.name.split(".").pop()||"").toLowerCase();
  const formats={pdf:"PDF",epub:"EPUB",txt:"TXT"};
  if(!formats[ext]){
    await Swal.fire({icon:"error",title:"Formato no permitido",text:"Solo se permiten PDF, EPUB o TXT."});
    return;
  }

  let coverPath = null;
  let coverUrl = null;

  try{
    if(cover){
      const coverExt=(cover.name.split(".").pop()||"").toLowerCase();
      if(!["jpg","jpeg","png","webp"].includes(coverExt)){
        await Swal.fire({icon:"error",title:"Portada no válida",text:"Usa una portada JPG, PNG o WEBP."});
        return;
      }
      $("#uploadStatus").textContent="Subiendo portada personalizada...";
      const coverBlob = cover.type === "image/jpeg" ? cover : await blobToJpeg(cover);
      const uploaded = await uploadCoverFromBlob(coverBlob, `${file.name}-cover.jpg`);
      coverPath = uploaded.path;
      coverUrl = uploaded.url;
    }else if(ext === "pdf"){
      $("#uploadStatus").textContent="Extrayendo portada del PDF...";
      const extractedBlob = await extractPdfCoverBlob(file);
      const uploaded = await uploadCoverFromBlob(extractedBlob, `${file.name}-pdf-cover.jpg`);
      coverPath = uploaded.path;
      coverUrl = uploaded.url;
    }

    $("#uploadStatus").textContent="Subiendo libro...";
    const clean=safeFileName(file.name);
    const path=`${crypto.randomUUID()}-${clean}`;

    const {error:uploadError}=await supabase.storage.from("books").upload(path,file,{upsert:false});
    if(uploadError){
      if(coverPath) await supabase.storage.from("covers").remove([coverPath]);
      $("#uploadStatus").textContent="";
      await Swal.fire({icon:"error",title:"No se pudo subir el libro",text:uploadError.message});
      return;
    }

    const {data:publicData}=supabase.storage.from("books").getPublicUrl(path);
    const row={
      title:$("#title").value.trim(),
      author:$("#author").value.trim(),
      category:$("#category").value,
      format:formats[ext],
      description:$("#description").value.trim()||null,
      cover_path:coverPath,
      cover_url:coverUrl,
      file_path:path,
      file_url:publicData.publicUrl
    };

    const {error:insertError}=await supabase.from("books").insert(row);
    if(insertError){
      await supabase.storage.from("books").remove([path]);
      if(coverPath) await supabase.storage.from("covers").remove([coverPath]);
      $("#uploadStatus").textContent="";
      await Swal.fire({icon:"error",title:"No se pudo publicar",text:insertError.message});
      return;
    }

    $("#uploadForm").reset();
    $("#uploadStatus").textContent="";
    await Swal.fire({icon:"success",title:"Libro publicado",text:coverUrl ? "El libro ya muestra su portada." : "El libro fue publicado correctamente.",confirmButtonText:"Listo"});
    await loadBooks();
  }catch(err){
    $("#uploadStatus").textContent="";
    await Swal.fire({icon:"error",title:"No se pudo preparar la portada",text:err?.message || "Ocurrió un error inesperado."});
  }
});

const {data:{session:initialSession}}=await supabase.auth.getSession();
session=initialSession;
await checkAdmin();
await loadSiteSettings();
await loadBooks();

supabase.auth.onAuthStateChange(async (_event,newSession)=>{
  session=newSession;
  await checkAdmin();
});


$("#closeReceiptModal")?.addEventListener("click", () => {
  $("#receiptModalImage").src = "";
  $("#receiptDialog").close();
});
