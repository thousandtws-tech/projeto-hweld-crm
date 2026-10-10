-- Seed de catálogo HWeld — 20 categorias + 20 produtos de soldagem B2B.
-- Idempotente: ON CONFLICT ignora slugs/SKUs já existentes.

BEGIN;

-- ── Categorias raiz ─────────────────────────────────────────────────────────
INSERT INTO categorias (nome, slug, descricao, ordem) VALUES
  ('Máquinas de Solda',        'maquinas-de-solda',       'Inversoras, MIG/MAG, TIG e multiprocesso',          10),
  ('Consumíveis de Solda',     'consumiveis-de-solda',    'Eletrodos, arames e varetas para todos os processos', 20),
  ('Corte e Goivagem',         'corte-e-goivagem',        'Maçaricos, plasma e eletrodos de goivagem',         30),
  ('Gases e Cilindros',        'gases-e-cilindros',       'Argônio, CO2, misturas e reguladores',              40),
  ('EPIs e Segurança',         'epis-seguranca',          'Máscaras, luvas, aventais e proteção do soldador',  50),
  ('Acessórios de Soldagem',   'acessorios-soldagem',     'Tochas, bicos, alicates e grampos',                 60),
  ('Abrasivos e Acabamento',   'abrasivos-acabamento',    'Discos de corte, desbaste e flap',                  70),
  ('Ferramentas Elétricas',    'ferramentas-eletricas',   'Esmerilhadeiras, furadeiras e retíficas',           80),
  ('Ferramentas Manuais',      'ferramentas-manuais',     'Esquadros, grampos e ferramentas de bancada',       90),
  ('Químicos e Vedantes',      'quimicos-vedantes',       'Antirrespingo, desengraxantes e zincagens',        100),
  ('Medição e Instrumentos',   'medicao-instrumentos',    'Calibradores de cordão, pirômetros e multímetros', 110),
  ('Automação e Posicionamento','automacao-posicionamento','Posicionadores, mesas e periféricos de solda',    120)
ON CONFLICT (slug) DO NOTHING;

-- ── Subcategorias ───────────────────────────────────────────────────────────
INSERT INTO categorias (nome, slug, descricao, categoria_pai_id, ordem) VALUES
  ('Inversoras MMA',      'inversoras-mma',      'Fontes CC portáteis para eletrodo revestido',
    (SELECT id FROM categorias WHERE slug = 'maquinas-de-solda'), 10),
  ('MIG/MAG',             'mig-mag',             'Fontes sinérgicas para arame maciço e fluxado',
    (SELECT id FROM categorias WHERE slug = 'maquinas-de-solda'), 20),
  ('TIG',                 'tig',                 'Fontes TIG AC/DC para solda de precisão',
    (SELECT id FROM categorias WHERE slug = 'maquinas-de-solda'), 30),
  ('Eletrodos Revestidos','eletrodos-revestidos','E6013, E7018 e inox para junta estrutural',
    (SELECT id FROM categorias WHERE slug = 'consumiveis-de-solda'), 10),
  ('Arames MIG',          'arames-mig',          'Arame maciço, fluxado e inox em carretel',
    (SELECT id FROM categorias WHERE slug = 'consumiveis-de-solda'), 20),
  ('Varetas TIG',         'varetas-tig',         'Varetas carbono e inox para alimentação manual',
    (SELECT id FROM categorias WHERE slug = 'consumiveis-de-solda'), 30),
  ('Máscaras de Solda',   'mascaras-de-solda',   'Máscaras fixas e de escurecimento automático',
    (SELECT id FROM categorias WHERE slug = 'epis-seguranca'), 10),
  ('Luvas e Vestimenta',  'luvas-vestimenta',    'Luvas de raspa, aventais e mangotes',
    (SELECT id FROM categorias WHERE slug = 'epis-seguranca'), 20)
ON CONFLICT (slug) DO NOTHING;

-- ── Produtos ────────────────────────────────────────────────────────────────
INSERT INTO produtos
  (sku, nome, slug, categoria_id, marca, unidade_medida, descricao_curta,
   descricao_tecnica, ncm, peso_kg, preco_custo, preco_venda, estoque_minimo, destaque)
VALUES
  ('INV-ESAB-220I',
   'Inversora de Solda MMA ESAB LHN 220i Plus 220V',
   'inversora-solda-mma-esab-lhn-220i-plus-220v',
   (SELECT id FROM categorias WHERE slug = 'inversoras-mma'),
   'ESAB', 'un', 'Inversora portátil 220A para eletrodo até 4,0mm — duty cycle 60%.',
   'Corrente 10–220A, eletrodos E6013/E7018/inox até 4,0mm, tensão de vazio 72V, ventilação forçada, alça e maleta inclusas.',
   '85153900', 6.800, 1390.00, 1949.00, 3, true),

  ('MIG-ESAB-250I',
   'Solda MIG/MAG ESAB Smashweld 250i 220V',
   'solda-mig-mag-esab-smashweld-250i-220v',
   (SELECT id FROM categorias WHERE slug = 'mig-mag'),
   'ESAB', 'un', 'Fonte MIG/MAG 250A sinérgica com tocha 3m e regulador inclusos.',
   'Corrente 30–250A, arame 0,8–1,2mm, bobinas até 15kg, painel sinérgico por material/gás, rolete duplo, ventilação sob demanda.',
   '85153900', 28.500, 4200.00, 5790.00, 2, true),

  ('TIG-BAL-2030',
   'Solda TIG Balmer Joy 2030 AC/DC 220V',
   'solda-tig-balmer-joy-2030-acdc-220v',
   (SELECT id FROM categorias WHERE slug = 'tig'),
   'Balmer', 'un', 'TIG AC/DC 200A para alumínio e inox com partida HF.',
   'Corrente 10–200A, AC/DC, partida HF e lift, pulsada, pós-fluxo regulável, tocha 26V 4m inclusa.',
   '85153900', 19.300, 2350.00, 3290.00, 2, false),

  ('MUL-ESAB-215',
   'Multiprocesso ESAB Rebel EMP 215ic (MIG/TIG/MMA) 220V',
   'multiprocesso-esab-rebel-emp-215ic-220v',
   (SELECT id FROM categorias WHERE slug = 'maquinas-de-solda'),
   'ESAB', 'un', 'Multiprocesso 3-em-1 com display TFT e modo sinérgico sMIG.',
   'MIG/TIG/MMA num único gabinete, corrente até 235A, interface TFT, sMIG adaptativo, carrinho integrado.',
   '85153900', 36.000, 9600.00, 12990.00, 1, true),

  ('ELT-6013-25-ESAB',
   'Eletrodo Revestido E6013 2,5mm — Caixa 5kg ESAB',
   'eletrodo-e6013-2-5mm-caixa-5kg-esab',
   (SELECT id FROM categorias WHERE slug = 'eletrodos-revestidos'),
   'ESAB', 'cx', 'Eletrodo rutílico uso geral — solda suave em todas as posições.',
   'AWS E6013, diâmetro 2,5mm, caixa 5kg, corrente CA/CC, aplicação em estruturas leves, serralheria e manutenção.',
   '83111000', 5.200, 61.00, 94.90, 20, false),

  ('ELT-7018-325-ESAB',
   'Eletrodo E7018 3,25mm OK 48.00 — Caixa 5kg ESAB',
   'eletrodo-e7018-3-25mm-ok48-caixa-5kg-esab',
   (SELECT id FROM categorias WHERE slug = 'eletrodos-revestidos'),
   'ESAB', 'cx', 'Eletrodo básico baixo hidrogênio para juntas de responsabilidade.',
   'AWS E7018, diâmetro 3,25mm, caixa 5kg, baixo hidrogênio H4, resistência à trinca, caldeiraria e estruturas pesadas.',
   '83111000', 5.400, 78.00, 118.50, 15, false),

  ('ELT-308L-25',
   'Eletrodo Inox E308L 2,5mm — Caixa 1kg Brasweld',
   'eletrodo-inox-e308l-2-5mm-caixa-1kg-brasweld',
   (SELECT id FROM categorias WHERE slug = 'eletrodos-revestidos'),
   'Brasweld', 'cx', 'Eletrodo inox austenítico para união de 304/304L.',
   'AWS E308L-16, diâmetro 2,5mm, caixa 1kg, resistente à corrosão, indústria alimentícia e tanques.',
   '83111000', 1.100, 47.00, 72.90, 10, false),

  ('ARM-ER70S6-15',
   'Arame MIG ER70S-6 1,0mm — Rolo 15kg ESAB',
   'arame-mig-er70s-6-1-0mm-rolo-15kg-esab',
   (SELECT id FROM categorias WHERE slug = 'arames-mig'),
   'ESAB', 'rl', 'Arame maciço cobreado uso geral — aporte uniforme e baixo respingo.',
   'AWS ER70S-6, diâmetro 1,0mm, carretel 15kg, aço carbono, gás CO2 ou mistura Ar+CO2, aplicação estrutural.',
   '72299000', 15.600, 218.00, 319.00, 10, false),

  ('ARM-E71T1-15',
   'Arame MIG Fluxado E71T-1 1,2mm — Rolo 15kg Brasweld',
   'arame-mig-fluxado-e71t-1-1-2mm-rolo-15kg-brasweld',
   (SELECT id FROM categorias WHERE slug = 'arames-mig'),
   'Brasweld', 'rl', 'Arame tubular autoprotegido para campo — sem gás de proteção.',
   'AWS E71T-1, diâmetro 1,2mm, carretel 15kg, autoprotegido, alta taxa de deposição, estruturas e montagem em campo.',
   '83112000', 15.900, 268.00, 389.00, 8, false),

  ('ARM-308L-5',
   'Arame MIG Inox ER308L 0,8mm — Rolo 5kg ESAB',
   'arame-mig-inox-er308l-0-8mm-rolo-5kg-esab',
   (SELECT id FROM categorias WHERE slug = 'arames-mig'),
   'ESAB', 'rl', 'Arame inox para chapas finas de 304/304L com mistura rica.',
   'AWS ER308L, diâmetro 0,8mm, carretel 5kg, gás Ar+2%O2 ou tri-mix, acabamento superior em chapas finas.',
   '72230000', 5.500, 342.00, 489.00, 6, false),

  ('VAR-ER70S2-24',
   'Vareta TIG ER70S-2 2,4mm — Caixa 1kg Vonder',
   'vareta-tig-er70s-2-2-4mm-caixa-1kg-vonder',
   (SELECT id FROM categorias WHERE slug = 'varetas-tig'),
   'Vonder', 'cx', 'Vareta carbono triplo desoxidado para raiz de qualidade.',
   'AWS ER70S-2, diâmetro 2,4mm, caixa 1kg, passe de raiz em tubulações, aparência limpa, solda TIG em aço carbono.',
   '83111000', 1.100, 44.00, 68.90, 12, false),

  ('VAR-308L-16',
   'Vareta TIG Inox ER308L 1,6mm — Caixa 1kg ESAB',
   'vareta-tig-inox-er308l-1-6mm-caixa-1kg-esab',
   (SELECT id FROM categorias WHERE slug = 'varetas-tig'),
   'ESAB', 'cx', 'Vareta inox para junções sanitárias e acabamento fino.',
   'AWS ER308L, diâmetro 1,6mm, caixa 1kg, purga de argônio recomendada, indústria alimentícia e farmacêutica.',
   '72230000', 1.100, 61.00, 92.50, 10, false),

  ('MAS-LYN-5000',
   'Máscara de Solda Automática Lynus MSL-5000',
   'mascara-solda-automatica-lynus-msl-5000',
   (SELECT id FROM categorias WHERE slug = 'mascaras-de-solda'),
   'Lynus', 'un', 'Escurecimento automático DIN 9–13 com 4 sensores e tonalidade regulável.',
   'Filtro automático 9–13, 4 sensores, comutação 1/25.000s, visor 100x83mm, alimentação solar + bateria, ajuste externo.',
   '90049090', 0.620, 189.00, 289.90, 8, true),

  ('LUV-RASPA-20',
   'Luva de Soldador Raspa 20cm Reforço Palma Delta Plus',
   'luva-soldador-raspa-20cm-delta-plus',
   (SELECT id FROM categorias WHERE slug = 'luvas-vestimenta'),
   'Delta Plus', 'par', 'Luva de raspa bovina com reforço — proteção térmica e mecânica.',
   'Couro raspa bovino, comprimento 20cm, reforço palma e polegar, costura em aramida, CA para soldagem MMA/MIG.',
   '42032990', 0.240, 16.50, 28.90, 25, false),

  ('AVE-RASPA-90',
   'Avental de Raspa Soldador 90x60cm Delta Plus',
   'avental-raspa-soldador-90x60cm-delta-plus',
   (SELECT id FROM categorias WHERE slug = 'luvas-vestimenta'),
   'Delta Plus', 'un', 'Avental de raspa com tiras ajustáveis — frente de trabalho protegida.',
   'Couro raspa 90x60cm, tiras de fixação reguláveis, costura em fio de aramida, proteção contra respingos e calor radiante.',
   '42034000', 0.780, 43.00, 69.90, 15, false),

  ('REG-ARG-FLUX',
   'Regulador de Pressão Argônio com Fluxômetro White Martins',
   'regulador-pressao-argonio-fluxometro-white-martins',
   (SELECT id FROM categorias WHERE slug = 'gases-e-cilindros'),
   'White Martins', 'un', 'Regulador duplo estágio com fluxômetro 0–25 L/min para TIG/MIG.',
   'Entrada cilindro P25, manômetro 0–315 bar, fluxômetro 0–25 L/min, saída 1/4" espiga, corpo latão forjado.',
   '84811019', 1.350, 128.00, 189.90, 8, false),

  ('TOC-MIG36-3M',
   'Tocha MIG 36KD 3m Euroconector Weld Vision',
   'tocha-mig-36kd-3m-euroconector',
   (SELECT id FROM categorias WHERE slug = 'acessorios-soldagem'),
   'Weld Vision', 'un', 'Tocha refrigerada a ar 340A CO2 — padrão europeu de encaixe rápido.',
   'Capacidade 340A CO2 / 300A mistura, cabo 3m, euroconector, bicos 0,8–1,2mm, gatilho e capa de desgaste inclusos.',
   '85159000', 2.900, 289.00, 429.00, 5, false),

  ('ALI-PE-500',
   'Alicate Porta-Eletrodo 500A Corpo Latão Vonder',
   'alicate-porta-eletrodo-500a-vonder',
   (SELECT id FROM categorias WHERE slug = 'acessorios-soldagem'),
   'Vonder', 'un', 'Porta-eletrodo isolado 500A com mola reforçada e cabo emborrachado.',
   'Capacidade 500A, corpo latão forjado, isolamento total, abertura multi-posição, uso em eletrodos até 5,0mm.',
   '82032090', 0.560, 33.00, 54.90, 20, false),

  ('DISC-CORTE-7-25',
   'Disco de Corte 7" Inox 1,6mm — Pacote c/25 Norton',
   'disco-corte-7-inox-1-6mm-pacote-25-norton',
   (SELECT id FROM categorias WHERE slug = 'abrasivos-acabamento'),
   'Norton', 'pct', 'Disco fino 180x1,6mm para corte limpo em inox e aço — pacote 25 un.',
   'Óxido de alumínio premium, 180x1,6x22,23mm, reforço dupla tela, sem ferro/enxofre/cloro, RPM máx. 8.500.',
   '68042219', 2.300, 41.00, 62.90, 30, false),

  ('ESM-ANG-850',
   'Esmerilhadeira Angular 4.1/2" 850W 220V Bosch GWS 850',
   'esmerilhadeira-angular-4-1-2-850w-bosch-gws850',
   (SELECT id FROM categorias WHERE slug = 'ferramentas-eletricas'),
   'Bosch', 'un', '850W compacta com proteção contra re-arranque — uso industrial contínuo.',
   'Potência 850W, disco 115mm, 11.000 RPM, restart protection, empunhadura lateral, carcaça compacta.',
   '84672999', 1.900, 232.00, 329.90, 6, false)
ON CONFLICT (sku) DO NOTHING;

-- ── Saldo inicial de estoque (portal exibe disponibilidade) ────────────────
INSERT INTO estoque_saldos (produto_id, quantidade_disponivel)
SELECT p.id, v.qty
FROM produtos p
JOIN (VALUES
  ('INV-ESAB-220I',    12),
  ('MIG-ESAB-250I',     6),
  ('TIG-BAL-2030',      4),
  ('MUL-ESAB-215',      2),
  ('ELT-6013-25-ESAB', 60),
  ('ELT-7018-325-ESAB',48),
  ('ELT-308L-25',      22),
  ('ARM-ER70S6-15',    35),
  ('ARM-E71T1-15',     20),
  ('ARM-308L-5',       14),
  ('VAR-ER70S2-24',    30),
  ('VAR-308L-16',      18),
  ('MAS-LYN-5000',     16),
  ('LUV-RASPA-20',     80),
  ('AVE-RASPA-90',     40),
  ('REG-ARG-FLUX',     15),
  ('TOC-MIG36-3M',      9),
  ('ALI-PE-500',       45),
  ('DISC-CORTE-7-25',  70),
  ('ESM-ANG-850',      11)
) AS v(sku, qty) ON v.sku = p.sku
ON CONFLICT DO NOTHING;

COMMIT;
