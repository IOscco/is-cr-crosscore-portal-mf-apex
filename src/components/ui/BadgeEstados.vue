<!--
  Referencia UX/UI: ps-text-badge / estados de expediente + Label_Status_XS.
  Paleta y radios alineados a guía Portal; tipografía vía --is-font-sans.
  Uso en app: BadgePill / BadgeXS + @/lib/estado-badge (mapeo de textos → variante).
-->
<template>
  <div class="be">
    <header class="be__header">
      <div class="be__header-top">
        <span class="be__brand">Apex</span>
        <span class="be__sep">/</span>
        <span class="be__guide">Estados · badges</span>
      </div>
      <div class="be__header-divider" />
      <div class="be__header-title">ps-text-badge</div>
    </header>

    <hr class="be__rule" />

    <section class="be__section">
      <div class="be__side">
        <span class="be__pill-label">Muestra en caja</span>
      </div>
      <div class="be__preview">
        <BadgePill variant="accepted">Aceptada</BadgePill>
        <BadgePill variant="blue">Campaña</BadgePill>
        <BadgePill variant="blue">nuevo</BadgePill>
        <BadgePill variant="pink">mantenimiento</BadgePill>
        <BadgePill variant="sky">próximamente</BadgePill>
        <BadgePill variant="pink">Vence: 30/07/2019</BadgePill>
        <BadgePill variant="sky">flujo de activación</BadgePill>
      </div>
    </section>

    <section class="be__section">
      <div class="be__side">
        <span class="be__pill-label">Estados de expediente</span>
      </div>
      <div class="be__badges">
        <p class="be__group-title">Estados de expediente</p>
        <div class="be__row">
          <BadgePill variant="blue">Campaña</BadgePill>
          <BadgePill variant="blue">creado</BadgePill>
          <BadgePill variant="blue">ingresado</BadgePill>
          <BadgePill variant="blue">aprobado</BadgePill>
          <BadgePill variant="orange">observado</BadgePill>
          <BadgePill variant="purple">acreditado</BadgePill>
          <BadgePill variant="red">rechazado</BadgePill>
          <BadgePill variant="teal">alta</BadgePill>
          <BadgePill variant="gray">anulado</BadgePill>
          <BadgePill variant="gray">expirado</BadgePill>
          <BadgePill variant="teal">entregado</BadgePill>
          <BadgePill variant="purple">activada</BadgePill>
          <BadgePill variant="purple">pendiente de documentos</BadgePill>
        </div>
      </div>
    </section>

    <section class="be__section">
      <div class="be__side">
        <span class="be__pill-label">Label_Status_XS</span>
      </div>
      <div class="be__xs">
        <BadgeXS variant="pending">pendiente</BadgeXS>
        <BadgeXS variant="observed">Observado</BadgeXS>
        <BadgeXS variant="approved">Aprobado</BadgeXS>
        <BadgeXS variant="rejected">Rechazado</BadgeXS>
        <BadgeXS variant="sent">enviado</BadgeXS>
      </div>
    </section>

    <hr class="be__rule" />
  </div>
</template>

<script setup lang="ts">
import BadgePill from './BadgePill.vue';
import BadgeXS from './BadgeXS.vue';
</script>

<style scoped>
.be {
  background-color: #fff;
  padding: 2rem 1.5rem 3rem;
  display: flex;
  flex-direction: column;
  gap: 2rem;
  font-family: var(--is-font-sans);
  font-size: 14px;
  color: #333;
  max-width: 960px;
}
.be__header {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  color: #006bf0;
  font-size: 16px;
}
.be__header-top {
  display: flex;
  align-items: center;
  gap: 8px;
}
.be__brand {
  font-weight: 700;
}
.be__guide {
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.be__header-divider {
  height: 2px;
  background-color: #006bf0;
}
.be__header-title {
  font-size: 1.75rem;
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1.2;
}
.be__rule {
  height: 2px;
  border: none;
  background-color: #006bf0;
  margin: 0;
}
.be__section {
  display: flex;
  align-items: flex-start;
  gap: 1.25rem;
  flex-wrap: wrap;
}
.be__side {
  width: 200px;
  flex-shrink: 0;
}
.be__pill-label {
  display: inline-block;
  background-color: #006bf0;
  color: #fff;
  border-radius: 3px;
  padding: 6px 16px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.02em;
}
.be__preview {
  width: 208px;
  min-height: 120px;
  border: 1px dashed #9747ff;
  border-radius: 5px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  box-sizing: border-box;
}
.be__badges {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  min-width: 0;
}
.be__group-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
  color: #333;
}
.be__row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.be__xs {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: flex-start;
}
</style>
