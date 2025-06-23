class OtimizadorRotas {
    constructor() {
        this.VELOCIDADE_MEDIA = 30; // km/h
        this.TEMPO_ENTREGA = 15; // minutos por entrega
    }

    // Algoritmo mais sofisticado usando Ant Colony Optimization
    async otimizarRotaAvancada(entregas, pontoInicial) {
        if (entregas.length <= 2) {
            return this.otimizarRotaSimples(entregas, pontoInicial);
        }

        // Implementação simplificada do ACO
        const melhorRota = await this.executarACO(entregas, pontoInicial);
        return melhorRota;
    }

    async executarACO(entregas, pontoInicial) {
        const NUM_FORMIGAS = 10;
        const NUM_ITERACOES = 50;
        const ALPHA = 1; // Importância do feromônio
        const BETA = 2;  // Importância da distância
        const RHO = 0.1; // Taxa de evaporação

        // Matriz de distâncias
        const distancias = await this.calcularMatrizDistancias(entregas, pontoInicial);
        
        // Matriz de feromônios
        const feromonios = this.inicializarFeromonios(entregas.length);

        let melhorRota = null;
        let melhorDistancia = Infinity;

        for (let iteracao = 0; iteracao < NUM_ITERACOES; iteracao++) {
            const rotas = [];

            // Cada formiga constrói uma solução
            for (let formiga = 0; formiga < NUM_FORMIGAS; formiga++) {
                const rota = this.construirRota(entregas, distancias, feromonios, ALPHA, BETA);
                const distanciaTotal = this.calcularDistanciaRota(rota, distancias);
                
                rotas.push({ rota, distancia: distanciaTotal });

                if (distanciaTotal < melhorDistancia) {
                    melhorDistancia = distanciaTotal;
                    melhorRota = [...rota];
                }
            }

            // Atualizar feromônios
            this.atualizarFeromonios(feromonios, rotas, RHO);
        }

        return melhorRota.map(index => entregas[index]);
    }

    construirRota(entregas, distancias, feromonios, alpha, beta) {
        const rota = [];
        const naoVisitados = Array.from({ length: entregas.length }, (_, i) => i);
        let atual = 0; // Começar do ponto inicial

        while (naoVisitados.length > 0) {
            const probabilidades = this.calcularProbabilidades(
                atual, naoVisitados, distancias, feromonios, alpha, beta
            );
            
            const proximo = this.selecionarProximo(naoVisitados, probabilidades);
            rota.push(proximo);
            naoVisitados.splice(naoVisitados.indexOf(proximo), 1);
            atual = proximo;
        }

        return rota;
    }

    calcularProbabilidades(atual, naoVisitados, distancias, feromonios, alpha, beta) {
        const probabilidades = [];
        let somatorio = 0;

        for (const candidato of naoVisitados) {
            const feromonio = Math.pow(feromonios[atual][candidato], alpha);
            const visibilidade = Math.pow(1 / distancias[atual][candidato], beta);
            const atratividade = feromonio * visibilidade;
            
            probabilidades.push(atratividade);
            somatorio += atratividade;
        }

        return probabilidades.map(p => p / somatorio);
    }

    selecionarProximo(candidatos, probabilidades) {
        const aleatorio = Math.random();
        let acumulado = 0;

        for (let i = 0; i < candidatos.length; i++) {
            acumulado += probabilidades[i];
            if (aleatorio <= acumulado) {
                return candidatos[i];
            }
        }

        return candidatos[candidatos.length - 1];
    }

    async calcularMatrizDistancias(entregas, pontoInicial) {
        const pontos = [pontoInicial, ...entregas];
        const matriz = Array(pontos.length).fill().map(() => Array(pontos.length).fill(0));

        for (let i = 0; i < pontos.length; i++) {
            for (let j = 0; j < pontos.length; j++) {
                if (i !== j) {
                    matriz[i][j] = this.calcularDistancia(
                        pontos[i].latitude, pontos[i].longitude,
                        pontos[j].latitude, pontos[j].longitude
                    );
                }
            }
        }

        return matriz;
    }

    calcularDistancia(lat1, lon1, lat2, lon2) {
        const R = 6371; // Raio da Terra em km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
            Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }

    inicializarFeromonios(tamanho) {
        const feromonioInicial = 1 / tamanho;
        return Array(tamanho + 1).fill().map(() => 
            Array(tamanho + 1).fill(feromonioInicial)
        );
    }

    atualizarFeromonios(feromonios, rotas, rho) {
        // Evaporação
        for (let i = 0; i < feromonios.length; i++) {
            for (let j = 0; j < feromonios[i].length; j++) {
                feromonios[i][j] *= (1 - rho);
            }
        }

        // Deposição
        for (const { rota, distancia } of rotas) {
            const depositoFeromonio = 1 / distancia;
            
            for (let i = 0; i < rota.length - 1; i++) {
                const de = rota[i];
                const para = rota[i + 1];
                feromonios[de][para] += depositoFeromonio;
                feromonios[para][de] += depositoFeromonio;
            }
        }
    }

    calcularDistanciaRota(rota, distancias) {
        let distanciaTotal = 0;
        
        // Do ponto inicial para o primeiro destino
        distanciaTotal += distancias[0][rota[0]];
        
        // Entre os destinos
        for (let i = 0; i < rota.length - 1; i++) {
            distanciaTotal += distancias[rota[i]][rota[i + 1]];
        }
        
        return distanciaTotal;
    }

    // Estimar tempo total da rota
    estimarTempoRota(rota, distancias) {
        const distanciaTotal = this.calcularDistanciaRota(rota, distancias);
        const tempoViagem = (distanciaTotal / this.VELOCIDADE_MEDIA) * 60; // em minutos
        const tempoEntregas = rota.length * this.TEMPO_ENTREGA;
        
        return {
            tempoViagem: Math.round(tempoViagem),
            tempoEntregas,
            tempoTotal: Math.round(tempoViagem + tempoEntregas),
            distanciaKm: Math.round(distanciaTotal * 100) / 100
        };
    }
}