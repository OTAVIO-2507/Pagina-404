const videos = [...document.querySelectorAll('.video-loop')];
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const temRVFC = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;

// Medido quadro a quadro no próprio clipe: a animação volta à pose inicial
// em t≈7,685s (quadro 184), com diferença de 0,58% — menos de um quadro de
// movimento natural, ou seja, imperceptível. Os ~6 quadros seguintes passam
// do ponto (chegam a 1,90%) e eram a causa do salto no fim do loop.
// A janela entre 7,52s e 7,77s é toda válida, então não é preciso ser exato.
const SAIDA = 7.66;

let atual = videos[0];
let reserva = videos[1];
let quadro;

atual.classList.add('frente');
reserva.classList.add('fundo');

function tocar(video) {
    const promessa = video.play();

    if (promessa) {
        promessa.catch(aguardarGesto);
    }
}

// alguns navegadores bloqueiam autoplay mesmo com o vídeo mudo
let esperandoGesto = false;

function aguardarGesto() {
    if (esperandoGesto) {
        return;
    }

    esperandoGesto = true;
    const corte = new AbortController();

    const retomar = () => {
        // um AbortController remove os dois de uma vez; com { once: true }
        // o listener não usado ficaria pendurado no documento
        corte.abort();
        esperandoGesto = false;
        tocar(atual);
        acompanhar(atual);
    };

    document.addEventListener('pointerdown', retomar, { signal: corte.signal });
    document.addEventListener('keydown', retomar, { signal: corte.signal });
}

// deixa a cópia de trás parada no quadro 0 e já decodificada, para que a
// troca seja instantânea: não há seek nem espera de buffer no momento do corte
function prepararReserva() {
    reserva.pause();
    reserva.currentTime = 0;
}

// identifica a cadeia ativa: qualquer cadeia antiga que ainda dispare um
// callback se encerra ao ver que o ciclo mudou
let ciclo = 0;

function acompanhar(video, id) {
    if (reduceMotion.matches) {
        return;
    }

    const meuId = id === undefined ? ++ciclo : id;

    const passo = (tempoDoQuadro) => {
        if (video !== atual || meuId !== ciclo) {
            return;
        }

        if (tempoDoQuadro >= SAIDA) {
            cortar();
        } else {
            acompanhar(video, meuId);
        }
    };

    if (temRVFC) {
        video.requestVideoFrameCallback((agora, meta) => passo(meta.mediaTime));
    } else {
        quadro = requestAnimationFrame(() => passo(video.currentTime));
    }
}

function pararAcompanhamento() {
    ciclo += 1;

    if (quadro) {
        cancelAnimationFrame(quadro);
        quadro = undefined;
    }
}

function cortar() {
    const saindo = atual;
    const entrando = reserva;

    // se a reserva ainda não tiver quadro pronto, reinicia no lugar em vez de piscar
    if (entrando.readyState < 2) {
        saindo.currentTime = 0;
        acompanhar(saindo);
        return;
    }

    atual = entrando;
    reserva = saindo;

    // a reserva já exibe o quadro 0, então subir a camada é o corte em si
    tocar(entrando);
    entrando.classList.replace('fundo', 'frente');
    saindo.classList.replace('frente', 'fundo');

    // escondida atrás da outra, esta cópia tem ~7,6s para voltar ao início
    saindo.pause();
    saindo.currentTime = 0;

    acompanhar(entrando);
}

function aplicarPreferencia() {
    if (reduceMotion.matches) {
        pararAcompanhamento();
        videos.forEach((item) => item.pause());
    } else {
        tocar(atual);
        acompanhar(atual);
    }
}

// rede de segurança: se a janela de corte for perdida, reinicia sem travar
videos.forEach((item) => item.addEventListener('ended', () => {
    if (item !== atual || reduceMotion.matches) {
        return;
    }

    item.currentTime = 0;
    tocar(item);
    acompanhar(item);
}));

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        pararAcompanhamento();
        videos.forEach((item) => item.pause());
    } else {
        prepararReserva();
        aplicarPreferencia();
    }
});

reduceMotion.addEventListener('change', aplicarPreferencia);

// a reserva só começa a baixar depois que a primeira cópia está em cache:
// disparar as duas juntas leva o navegador a buscar o mesmo arquivo duas vezes
let reservaPedida = false;

function carregarReserva() {
    if (reservaPedida) {
        return;
    }

    const fonte = reserva.dataset.src;

    if (!fonte) {
        return;
    }

    reservaPedida = true;
    reserva.addEventListener('loadeddata', prepararReserva, { once: true });
    reserva.src = fonte;
}

if (atual.readyState >= 4) {
    carregarReserva();
} else {
    atual.addEventListener('canplaythrough', carregarReserva, { once: true });
    // rede de segurança: canplaythrough nem sempre dispara em conexão lenta
    atual.addEventListener('loadeddata', () => window.setTimeout(carregarReserva, 3000), { once: true });
}

aplicarPreferencia();

/* ---------- Menu do cabeçalho ---------- */

const cabecalho = document.querySelector('.cabecalho');
const botaoMenu = cabecalho.querySelector('.menu');
const navPrincipal = document.getElementById('nav-principal');
const telaLarga = window.matchMedia('(min-width: 821px)');

function alternarMenu(abrir) {
    cabecalho.classList.toggle('aberto', abrir);
    botaoMenu.setAttribute('aria-expanded', String(abrir));
    botaoMenu.setAttribute('aria-label', abrir ? 'Fechar menu' : 'Abrir menu');
}

botaoMenu.addEventListener('click', () => {
    alternarMenu(!cabecalho.classList.contains('aberto'));
});

navPrincipal.addEventListener('click', (evento) => {
    if (evento.target.closest('a')) {
        alternarMenu(false);
    }
});

document.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape' && cabecalho.classList.contains('aberto')) {
        alternarMenu(false);
        botaoMenu.focus();
    }
});

document.addEventListener('pointerdown', (evento) => {
    if (cabecalho.classList.contains('aberto') && !cabecalho.contains(evento.target)) {
        alternarMenu(false);
    }
});

// ao voltar para o desktop a nav vira barra de novo: o estado aberto perde sentido
telaLarga.addEventListener('change', (evento) => {
    if (evento.matches) {
        alternarMenu(false);
    }
});
