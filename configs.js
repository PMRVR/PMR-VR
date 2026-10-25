// configs.js
export const CONFIG = {
  // ===== VOICE CHAT (Metered TURN) =====
  TURN_USERNAME: "COLOCA_O_TEU_USERNAME_AQUI",
  TURN_CREDENTIAL: "COLOCA_A_TUA_PASSWORD_AQUI",

  // ===== FÍSICA =====
  GRAVITY: 20,
  PUSH_MULTIPLIER: 120,   // Força do empurrão (baixa se tiveres a voar)
  MAX_SPEED: 10,          // Velocidade máxima (o "Flash" desaparece com 10)
  AIR_DRAG: 0.96,         // Atrito no ar (quanto mais perto de 1, mais deslizas)
  GROUND_FRICTION: 0.7,   // Atrito no chão (para parar rápido)

  // ===== JOGO =====
  PLAYER_HEIGHT: 1.6,     // Altura dos olhos
  PLAYER_RADIUS: 0.3,     // Grossura do corpo (para colisões)
  HAND_SIZE: 0.15,        // Tamanho do cubo da mão
  HEAD_SIZE: 0.8,         // Tamanho da cabeça cinza
};