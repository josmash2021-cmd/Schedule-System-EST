/* ============================================================
   ElectronicST — Reseñas de clientes
   Una sola lista para la franja del inicio y la página /reviews
   (las pinta assets/resenas.js).

   OJO: estas 15 son las reseñas que ya había en el sitio (escritas a mano
   desde julio de 2026, sin origen comprobado). NO vienen de Google, por eso
   van con fuente "". El dueño pidió asignarles productos del catálogo y
   fotografías reales de stock: no son fotos de clientes ni compras verificadas.
   Cuando lleguen las REALES del perfil de Google se reemplazan: texto tal
   cual lo escribió el cliente (texto_en solo si se quiere una traducción),
   nombre como sale en Google, estrellas (1–5), fecha (AAAA-MM-DD), fuente
   "google", foto y producto comprobados.
   fuente = "google" muestra la palabra Google en la tarjeta. Solo para
   reseñas copiadas del perfil real de Google; nunca para otras.
   foto = retrato fotográfico real de stock (Unsplash), guardado en
   assets/img/resenas/ (vacía = salen sus iniciales). No es el cliente real.
   producto = clave de "productos": sale su foto, su nombre y el enlace a su
   página. Las asignaciones actuales son ilustrativas, a petición del dueño.
   googleUrl = link del perfil para el botón "Déjanos tu reseña en Google"
   (vacío = el botón no se muestra).
   ============================================================ */
window.EST_RESENAS = {
    googleUrl: "",
    // Equipos del catálogo (server/catalog.js) que pueden salir en una reseña
    productos: {
        "iphone-15-pro": { nombre: "iPhone 15 Pro", img: "assets/img/iphone-15-pro.jpg", url: "/iphone-15-pro" },
        "macbook-air-13": { nombre: "MacBook Air 13\"", img: "assets/img/macbook-air-13.jpg", url: "/macbook-air-13" },
        "macbook-pro-2020": { nombre: "MacBook Pro 2020", img: "assets/img/macbook-pro-2020.jpg", url: "/macbook-pro-2020" },
        "macbook-pro-2019": { nombre: "MacBook Pro 2019 15\"", img: "assets/img/macbook-pro-2019.jpg", url: "/macbook-pro-2019" },
        "macbook-neo-2026": { nombre: "MacBook Neo 2026", img: "assets/img/macbook-neo-green.jpg", url: "/macbook-neo-2026" },
        "ipad-2025-a16": { nombre: "iPad 2025", img: "assets/img/ipad-2025-a16.jpg", url: "/ipad-2025-a16" },
        "airpods-max-pink": { nombre: "AirPods Max", img: "assets/img/airpods-max-pink.jpg", url: "/airpods-max-pink" },
        "hp-15-pentium": { nombre: "HP 15.6\" Pentium", img: "assets/img/hp-15-pentium.jpg", url: "/hp-15-pentium" },
        "victus-gaming": { nombre: "HP Victus Gaming 15.6\"", img: "assets/img/victus-gaming.jpg", url: "/victus-gaming" },
        "alienware-16-aurora": { nombre: "Alienware 16 Aurora", img: "assets/img/alienware-16-aurora.jpg", url: "/alienware-16-aurora" }
    },
    lista: [
        { producto: "macbook-pro-2020", foto: "assets/img/resenas/maria-g.jpg", fuente: "", nombre: "María G.", estrellas: 5, fecha: "", texto: "Excelente equipo, llegó en perfectas condiciones y la batería dura muchísimo. Muy recomendado.", texto_en: "Excellent device, it arrived in perfect condition and the battery lasts a really long time. Highly recommended." },
        { producto: "macbook-air-13", foto: "assets/img/resenas/carlos-r.jpg", fuente: "", nombre: "Carlos R.", estrellas: 5, fecha: "", texto: "La MacBook Air funciona como nueva. El servicio fue rápido y muy profesional. Volveré a comprar.", texto_en: "The MacBook Air works like new. The service was fast and very professional. I will buy again." },
        { producto: "iphone-15-pro", foto: "assets/img/resenas/ana-l.jpg", fuente: "", nombre: "Ana L.", estrellas: 5, fecha: "", texto: "Precio justo y equipo verificado. Me explicaron todo antes de comprar. Muy contenta con mi compra.", texto_en: "Fair price and a verified device. They explained everything before I bought. Very happy with my purchase." },
        { producto: "macbook-air-13", foto: "assets/img/resenas/david-m.jpg", fuente: "", nombre: "David M.", estrellas: 5, fecha: "", texto: "Perfecta para la universidad. Ligera, rápida y con excelente soporte técnico. 100% recomendada.", texto_en: "Perfect for college. Light, fast, and with excellent technical support. 100% recommended." },
        { producto: "hp-15-pentium", foto: "assets/img/resenas/laura-p.jpg", fuente: "", nombre: "Laura P.", estrellas: 5, fecha: "", texto: "Compré para mi hija y quedó encantada. La laptop se ve y funciona como nueva. Gran experiencia.", texto_en: "I bought it for my daughter and she loved it. The laptop looks and works like new. Great experience." },
        { producto: "macbook-pro-2019", foto: "assets/img/resenas/jorge-t.jpg", fuente: "", nombre: "Jorge T.", estrellas: 5, fecha: "", texto: "Muy buena atención y el equipo llegó impecable. Se nota que revisan cada detalle antes de entregar.", texto_en: "Very good service and the device arrived spotless. You can tell they check every detail before delivery." },
        { producto: "macbook-air-13", foto: "assets/img/resenas/sofia-h.jpg", fuente: "", nombre: "Sofía H.", estrellas: 5, fecha: "", texto: "Rápido, confiable y con garantía. La MacBook Air 2017 sigue siendo una gran opción en 2026.", texto_en: "Fast, reliable, and with warranty. The MacBook Air 2017 is still a great option in 2026." },
        { producto: "macbook-pro-2020", foto: "assets/img/resenas/miguel-a.jpg", fuente: "", nombre: "Miguel A.", estrellas: 5, fecha: "", texto: "Excelente calidad por el precio. El equipo se siente premium y el servicio post-venta es muy bueno.", texto_en: "Excellent quality for the price. The device feels premium and the after-sales service is very good." },
        { producto: "ipad-2025-a16", foto: "assets/img/resenas/carmen-v.jpg", fuente: "", nombre: "Carmen V.", estrellas: 5, fecha: "", texto: "Mi segunda compra aquí y siempre igual de satisfecho. Equipos originales y muy buen trato.", texto_en: "My second purchase here and always just as satisfied. Original devices and great treatment." },
        { producto: "macbook-pro-2020", foto: "assets/img/resenas/roberto-s.jpg", fuente: "", nombre: "Roberto S.", estrellas: 5, fecha: "", texto: "La batería dura todo el día y el equipo es súper rápido. Mejor de lo que esperaba por el precio.", texto_en: "The battery lasts all day and the device is super fast. Better than I expected for the price." },
        { producto: "ipad-2025-a16", foto: "assets/img/resenas/elena-d.jpg", fuente: "", nombre: "Elena D.", estrellas: 5, fecha: "", texto: "Atención personalizada y equipo en perfecto estado. Definitivamente volveré para mi próxima compra.", texto_en: "Personalized attention and a device in perfect condition. I will definitely come back for my next purchase." },
        { producto: "macbook-neo-2026", foto: "assets/img/resenas/fernando-c.jpg", fuente: "", nombre: "Fernando C.", estrellas: 5, fecha: "", texto: "Muy profesionales. Me ayudaron a elegir el equipo ideal y todo el proceso fue muy sencillo.", texto_en: "Very professional. They helped me choose the ideal device and the whole process was very easy." },
        { producto: "macbook-pro-2019", foto: "assets/img/resenas/isabel-n.jpg", fuente: "", nombre: "Isabel N.", estrellas: 5, fecha: "", texto: "La MacBook llegó en excelente estado y con todo lo prometido. Muy contento con la compra.", texto_en: "The MacBook arrived in excellent condition with everything promised. Very happy with the purchase." },
        { producto: "macbook-pro-2020", foto: "assets/img/resenas/pablo-o.jpg", fuente: "", nombre: "Pablo O.", estrellas: 5, fecha: "", texto: "Gran tienda, equipos verificados y precios justos. La recomiendo a cualquiera que busque una MacBook.", texto_en: "Great store, verified devices, and fair prices. I recommend it to anyone looking for a MacBook." },
        { producto: "macbook-air-13", foto: "assets/img/resenas/andrea-b.jpg", fuente: "", nombre: "Andrea B.", estrellas: 5, fecha: "", texto: "Servicio excepcional y equipo de primera. Mi MacBook Air funciona perfecto desde el primer día.", texto_en: "Exceptional service and a top-notch device. My MacBook Air has worked perfectly since day one." }
    ]
};
