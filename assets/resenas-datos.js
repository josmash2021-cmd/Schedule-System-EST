/* ============================================================
   ElectronicST — Reseñas de clientes en Google
   Una sola lista para la franja del inicio y la página /reviews
   (las pinta assets/resenas.js).

   OJO — EJEMPLO: estas 15 son las reseñas que había en el sitio, sin
   origen comprobado. Antes de publicar se reemplazan por las REALES del
   perfil de Google del negocio: texto tal cual lo escribió el cliente
   (texto_en solo si se quiere una traducción para teléfonos en inglés),
   nombre como sale en Google, estrellas (1–5) y fecha (AAAA-MM-DD).
   googleUrl = link del perfil para el botón "Déjanos tu reseña en Google"
   (vacío = el botón no se muestra).
   ============================================================ */
window.EST_RESENAS = {
    googleUrl: "",
    lista: [
        { nombre: "María G.", estrellas: 5, fecha: "", texto: "Excelente equipo, llegó en perfectas condiciones y la batería dura muchísimo. Muy recomendado.", texto_en: "Excellent device, it arrived in perfect condition and the battery lasts a really long time. Highly recommended." },
        { nombre: "Carlos R.", estrellas: 5, fecha: "", texto: "La MacBook Air funciona como nueva. El servicio fue rápido y muy profesional. Volveré a comprar.", texto_en: "The MacBook Air works like new. The service was fast and very professional. I will buy again." },
        { nombre: "Ana L.", estrellas: 5, fecha: "", texto: "Precio justo y equipo verificado. Me explicaron todo antes de comprar. Muy contenta con mi compra.", texto_en: "Fair price and a verified device. They explained everything before I bought. Very happy with my purchase." },
        { nombre: "David M.", estrellas: 5, fecha: "", texto: "Perfecta para la universidad. Ligera, rápida y con excelente soporte técnico. 100% recomendada.", texto_en: "Perfect for college. Light, fast, and with excellent technical support. 100% recommended." },
        { nombre: "Laura P.", estrellas: 5, fecha: "", texto: "Compré para mi hija y quedó encantada. La laptop se ve y funciona como nueva. Gran experiencia.", texto_en: "I bought it for my daughter and she loved it. The laptop looks and works like new. Great experience." },
        { nombre: "Jorge T.", estrellas: 5, fecha: "", texto: "Muy buena atención y el equipo llegó impecable. Se nota que revisan cada detalle antes de entregar.", texto_en: "Very good service and the device arrived spotless. You can tell they check every detail before delivery." },
        { nombre: "Sofía H.", estrellas: 5, fecha: "", texto: "Rápido, confiable y con garantía. La MacBook Air 2017 sigue siendo una gran opción en 2026.", texto_en: "Fast, reliable, and with warranty. The MacBook Air 2017 is still a great option in 2026." },
        { nombre: "Miguel A.", estrellas: 5, fecha: "", texto: "Excelente calidad por el precio. El equipo se siente premium y el servicio post-venta es muy bueno.", texto_en: "Excellent quality for the price. The device feels premium and the after-sales service is very good." },
        { nombre: "Carmen V.", estrellas: 5, fecha: "", texto: "Mi segunda compra aquí y siempre igual de satisfecho. Equipos originales y muy buen trato.", texto_en: "My second purchase here and always just as satisfied. Original devices and great treatment." },
        { nombre: "Roberto S.", estrellas: 5, fecha: "", texto: "La batería dura todo el día y el equipo es súper rápido. Mejor de lo que esperaba por el precio.", texto_en: "The battery lasts all day and the device is super fast. Better than I expected for the price." },
        { nombre: "Elena D.", estrellas: 5, fecha: "", texto: "Atención personalizada y equipo en perfecto estado. Definitivamente volveré para mi próxima compra.", texto_en: "Personalized attention and a device in perfect condition. I will definitely come back for my next purchase." },
        { nombre: "Fernando C.", estrellas: 5, fecha: "", texto: "Muy profesionales. Me ayudaron a elegir el equipo ideal y todo el proceso fue muy sencillo.", texto_en: "Very professional. They helped me choose the ideal device and the whole process was very easy." },
        { nombre: "Isabel N.", estrellas: 5, fecha: "", texto: "La MacBook llegó en excelente estado y con todo lo prometido. Muy contento con la compra.", texto_en: "The MacBook arrived in excellent condition with everything promised. Very happy with the purchase." },
        { nombre: "Pablo O.", estrellas: 5, fecha: "", texto: "Gran tienda, equipos verificados y precios justos. La recomiendo a cualquiera que busque una MacBook.", texto_en: "Great store, verified devices, and fair prices. I recommend it to anyone looking for a MacBook." },
        { nombre: "Andrea B.", estrellas: 5, fecha: "", texto: "Servicio excepcional y equipo de primera. Mi MacBook Air funciona perfecto desde el primer día.", texto_en: "Exceptional service and a top-notch device. My MacBook Air has worked perfectly since day one." }
    ]
};
