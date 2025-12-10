// src/types/index.ts
// Tipos centralizados do sistema

// ========================================
// DATABASE ENTITIES
// ========================================

export interface Usuario {
  id: number;
  username: string;
  email: string;
  password_hash: string;
  nome_completo: string | null;
  ativo: boolean;
  ultimo_login: Date | null;
  created_at: Date;
}

export interface Produto {
  id: number;
  codigo: string;
  descricao: string;
  unidade: 'UN' | 'KG' | 'LT' | 'MT' | 'CX' | 'CT' | 'PC' | 'DZ';
  categoria: string | null;
  estoque_minimo: number;
  preco_custo: number | null;
  percentual_comissao: number | null;
  created_at: Date;
  // Computed
  saldo_atual?: number;
}

export interface Fornecedor {
  id: number;
  nome: string;
  cnpj: string | null;
  endereco: string | null;
  cep: string | null;
  telefone: string | null;
  email: string | null;
  observacao: string | null;
  created_at: Date;
}

export interface Cliente {
  id: number;
  nome: string;
  cpf_cnpj: string | null;
  endereco: string | null;
  cep: string | null;
  telefone: string | null;
  email: string | null;
  rca_id: number | null;
  observacao: string | null;
  created_at: Date;
}

export interface RCA {
  id: number;
  nome: string;
  praca: string | null;
  cpf: string | null;
  endereco: string | null;
  cep: string | null;
  telefone: string | null;
  email: string | null;
  observacao: string | null;
  created_at: Date;
}

export interface Movimentacao {
  id: number;
  produto_id: number;
  fornecedor_id: number | null;
  cliente: string | null;
  rca: string | null;
  tipo: 'ENTRADA' | 'SAIDA';
  quantidade: number;
  preco_unitario: number | null;
  valor_total: number | null;
  documento: string | null;
  observacao: string | null;
  created_at: Date;
  // Joins
  produto_descricao?: string;
  produto_codigo?: string;
  fornecedor_nome?: string;
}

export interface ContaReceber {
  id: number;
  movimentacao_id: number | null;
  cliente_nome: string;
  descricao: string | null;
  numero_parcela: number;
  total_parcelas: number;
  valor: number;
  data_vencimento: Date;
  data_pagamento: Date | null;
  status: 'Pendente' | 'Pago';
  fluxo_caixa_id: number | null;
  created_at: Date;
  // Computed
  dias_atraso?: number;
}

export interface ContaPagar {
  id: number;
  fornecedor_id: number | null;
  descricao: string;
  valor: number;
  data_vencimento: Date;
  data_pagamento: Date | null;
  status: 'Pendente' | 'Pago';
  categoria_id: number | null;
  fluxo_caixa_id: number | null;
  created_at: Date;
  // Joins
  fornecedor_nome?: string;
  categoria_nome?: string;
}

export interface FluxoCaixa {
  id: number;
  data_operacao: Date;
  tipo: 'CREDITO' | 'DEBITO';
  valor: number;
  descricao: string;
  categoria_id: number | null;
  status: 'PAGO' | 'PENDENTE';
  conta_receber_id: number | null;
  conta_pagar_id: number | null;
  created_at: Date;
  // Joins
  categoria_nome?: string;
}

export interface CategoriaFinanceira {
  id: number;
  nome: string;
  tipo: 'RECEITA' | 'DESPESA';
}

export interface Entrega {
  id: number;
  cliente_nome: string;
  endereco_completo: string;
  telefone: string | null;
  data_entrega: Date;
  hora_entrega: Date | null;
  status: 'PENDENTE' | 'ENTREGUE';
  ordem_entrega: number | null;
  latitude: number | null;
  longitude: number | null;
  observacao: string | null;
  created_at: Date;
}

export interface WarehouseConfig {
  id: number;
  nome: string;
  endereco: string;
  latitude: number;
  longitude: number;
  velocidade_media_kmh: number;
  tempo_entrega_minutos: number;
  horario_inicio: string;
  horario_fim: string;
  is_active: boolean;
}

export interface ComissaoRCA {
  id: number;
  rca_id: number;
  periodo_inicio: Date;
  periodo_fim: Date;
  valor_vendas: number;
  valor_comissao: number;
  status: 'PENDENTE' | 'PAGO' | 'CANCELADO';
  data_pagamento: Date | null;
  fluxo_caixa_id: number | null;
  created_at: Date;
}

// ========================================
// REQUEST/RESPONSE TYPES
// ========================================

export interface SessionUser {
  id: number;
  username: string;
  nomeCompleto: string | null;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  details?: ValidationError[];
}

export interface ValidationError {
  field: string;
  message: string;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface DateRangeParams {
  data_inicio?: string;
  data_fim?: string;
}

// ========================================
// DASHBOARD TYPES
// ========================================

export interface DashboardData {
  faturamento: {
    atual: number;
    anterior: number;
    variacao: number;
    totalVendas: number;
  };
  fluxoCaixa: {
    creditos: number;
    debitos: number;
    saldo: number;
  };
  lucro: {
    valor: number;
    margem: number;
  };
  contasVencidas: {
    total: number;
    valor_total: number;
  };
  produtosBaixoEstoque: Produto[];
  topProdutos: {
    descricao: string;
    quantidade_vendida: number;
    valor_total: number;
  }[];
  inadimplencia: {
    clientes_inadimplentes: number;
    valor_total: number;
    mais_30_dias: number;
  };
  entregas: {
    total: number;
    pendentes: number;
    entregues: number;
  };
}

// ========================================
// DRE TYPES
// ========================================

export interface DREEstrutura {
  label: string;
  tipo: 'header' | 'item' | 'total';
  css?: string;
}

export interface DREResultados {
  [categoria: string]: number[];
}