-- Use by Cami: estrutura sem dados nem credenciais
-- Crie/selecione seu banco antes da importação.
SET NAMES utf8mb4;

-- Acessos administrativos independentes de customers; password contém hash.
CREATE TABLE `admins` (
  `id` int NOT NULL AUTO_INCREMENT,
  `email` varchar(190) NOT NULL,
  `password` varchar(255) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Configurações nome/valor: contatos, aviso e demonstração.
CREATE TABLE `settings` (
  `name` varchar(80) NOT NULL,
  `value` text NOT NULL,
  PRIMARY KEY (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Peças do catálogo; preços em centavos e caminho da imagem, sem estoque agregado.
CREATE TABLE `products` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(150) NOT NULL,
  `category` varchar(80) NOT NULL,
  `description` text NOT NULL,
  `price` int NOT NULL,
  `old_price` int NOT NULL DEFAULT '0',
  `image` varchar(500) NOT NULL,
  `featured` int NOT NULL DEFAULT '0',
  `active` int NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Combinações únicas de produto/tamanho/cor; stock é a quantidade disponível.
CREATE TABLE `variants` (
  `id` int NOT NULL AUTO_INCREMENT,
  `product_id` int NOT NULL,
  `size` varchar(20) NOT NULL,
  `color` varchar(60) NOT NULL,
  `stock` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `product_id` (`product_id`,`size`,`color`),
  CONSTRAINT `variants_ibfk_1` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Cabeçalho e retrato da entrega na compra; request_key evita duplicação e subtotal é em centavos.
CREATE TABLE `orders` (
  `id` int NOT NULL AUTO_INCREMENT,
  `reference` varchar(40) NOT NULL,
  `request_key` varchar(80) NOT NULL,
  `customer` varchar(150) NOT NULL,
  `email` varchar(190) NOT NULL,
  `phone` varchar(30) NOT NULL,
  `address` text NOT NULL,
  `subtotal` int NOT NULL,
  `status` varchar(30) NOT NULL DEFAULT 'pending',
  `created_at` varchar(30) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `reference` (`reference`),
  UNIQUE KEY `request_key` (`request_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Itens com nome/preço no momento da compra, ligados à variação do estoque.
CREATE TABLE `order_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `order_id` int NOT NULL,
  `variant_id` int NOT NULL,
  `name` varchar(250) NOT NULL,
  `quantity` int NOT NULL,
  `price` int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `order_id` (`order_id`),
  KEY `variant_id` (`variant_id`),
  CONSTRAINT `order_items_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`),
  CONSTRAINT `order_items_ibfk_2` FOREIGN KEY (`variant_id`) REFERENCES `variants` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Histórico de deltas do estoque e seus motivos; pedidos/cancelamentos também geram registros.
CREATE TABLE `movements` (
  `id` int NOT NULL AUTO_INCREMENT,
  `variant_id` int NOT NULL,
  `delta` int NOT NULL,
  `reason` varchar(250) NOT NULL,
  `created_at` varchar(30) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `variant_id` (`variant_id`),
  CONSTRAINT `movements_ibfk_1` FOREIGN KEY (`variant_id`) REFERENCES `variants` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Limitação de tentativas de entrada administrativa por IP.
CREATE TABLE `login_attempts` (
  `ip` varchar(64) NOT NULL,
  `attempts` int NOT NULL,
  `last_attempt` int NOT NULL,
  PRIMARY KEY (`ip`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Cadastro e hash da senha; auth_version invalida sessões e must_change_password exige troca. recovery_hash é legado sem uso.
CREATE TABLE `customers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(150) NOT NULL,
  `email` varchar(190) NOT NULL,
  `password` varchar(255) NOT NULL,
  `phone` varchar(30) NOT NULL,
  `address` text NOT NULL,
  `recovery_hash` varchar(64) NOT NULL,
  `auth_version` int NOT NULL DEFAULT '1',
  `created_at` varchar(30) NOT NULL,
  `must_change_password` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Vínculo único do pedido com a conta proprietária, usado para autorizar consultas.
CREATE TABLE `customer_orders` (
  `order_id` int NOT NULL,
  `customer_id` int NOT NULL,
  PRIMARY KEY (`order_id`),
  KEY `customer_id` (`customer_id`),
  CONSTRAINT `customer_orders_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`),
  CONSTRAINT `customer_orders_ibfk_2` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Hashes de códigos privados de compras históricas; consumidos ao vincular a compra.
CREATE TABLE `order_access` (
  `order_id` int NOT NULL,
  `token_hash` varchar(64) NOT NULL,
  PRIMARY KEY (`order_id`),
  CONSTRAINT `order_access_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Etapas de cada pedido e seus horários para a linha do tempo.
CREATE TABLE `order_events` (
  `id` int NOT NULL AUTO_INCREMENT,
  `order_id` int NOT NULL,
  `status` varchar(30) NOT NULL,
  `created_at` varchar(30) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `order_id` (`order_id`),
  CONSTRAINT `order_events_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Dados de entrega/rastreio informados manualmente pela equipe, um registro por pedido.
CREATE TABLE `order_shipping` (
  `order_id` int NOT NULL,
  `carrier` varchar(100) NOT NULL,
  `tracking_code` varchar(100) NOT NULL,
  `tracking_url` varchar(500) NOT NULL,
  `updated_at` varchar(30) NOT NULL,
  PRIMARY KEY (`order_id`),
  CONSTRAINT `order_shipping_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Contadores por hash de finalidade/IP para limitar tentativas de ações sensíveis.
CREATE TABLE `customer_attempts` (
  `identifier` varchar(64) NOT NULL,
  `attempts` int NOT NULL,
  `window_start` int NOT NULL,
  PRIMARY KEY (`identifier`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

