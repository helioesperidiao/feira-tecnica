// Server.js
const express = require("express");
const cors = require("cors");
const path = require("path");

const ErrorResponse = require("./src/api/utils/ErrorResponse");
const logger = require("./src/api/utils/Logger"); // <-- Logger profissional

// Middlewares
const JwtMiddleware = require("./src/api/middleware/JwtMiddleware");

// Roteadores
const CargoRouter = require("./src/api/routes/CargoRouter");
const FuncionarioRouter = require("./src/api/routes/FuncionarioRouter");

// Middlewares específicos das entidades
const CargoMiddleware = require("./src/api/middleware/CargoMiddleware");
const FuncionarioMiddleware = require("./src/api/middleware/FuncionarioMiddleware");

// Controllers
const CargoController = require("./src/api/controllers/CargoController");
const FuncionarioController = require("./src/api/controllers/FuncionarioController");

// Services
const CargoService = require("./src/api/services/CargoService");
const FuncionarioService = require("./src/api/services/FuncionarioService");

// DAOs MongoDB
const CargoDAOMongo = require("./src/api/dao/CargoDAOMongo");
const FuncionarioDAOMongo = require("./src/api/dao/FuncionarioDAOMongo");

// Banco de dados MongoDB
const MongoDatabase = require("./src/api/database/MongoDatabase");

// Para seed
const bcrypt = require("bcrypt");

module.exports = class Server {
    #porta;
    #app;
    #router;

    #database;

    #jwtMiddleware;

    #cargoRouter;
    #cargoMiddleware;
    #cargoController;
    #cargoService;
    #cargoDAO;

    #funcionarioRouter;
    #funcionarioMiddleware;
    #funcionarioController;
    #funcionarioService;
    #funcionarioDAO;

    constructor(porta) {
        logger.info('⬆️ Server.constructor()');
        this.#porta = porta ?? 8080;
        logger.debug('🔍 Porta configurada', { porta: this.#porta });
    }

    init = async () => {
        const method = 'Server.init';
        logger.info(`⬆️ ${method} - Iniciando servidor`);

        this.#app = express();
        this.#router = express.Router();

        // Middlewares globais
        this.#app.use(express.json());
        logger.debug(`✅ ${method} - express.json() configurado`);

        // Servir arquivos estáticos da pasta public (dentro de src)
        const publicPath = path.join(process.cwd(), "src/public");
        logger.debug(`📂 ${method} - Servindo arquivos estáticos de: ${publicPath}`);
        this.#app.use(express.static(publicPath));

        // CORS
        this.#app.use(cors({ origin: "*" }));
        logger.debug(`✅ ${method} - CORS configurado`);

        this.#jwtMiddleware = new JwtMiddleware();

        // Conecta ao MongoDB
        logger.debug(`🔄 ${method} - Conectando ao MongoDB...`);
        this.#database = new MongoDatabase({
            host: 'localhost',
            port: 27017,
            database: 'feira-tecnica2026',
            user: '',
            password: '',
        });
        await this.#database.connect();
        logger.info(`✅ ${method} - Conectado ao MongoDB com sucesso`);

        // Executa seed (popular banco com dados iniciais se estiver vazio)
        await this.#seedDatabase();

        // Monta dependências e rotas
        this.beforeRouting();
        this.setupCargo();
        this.setupFuncionario();
        this.setupErrorMiddleware();

        logger.info(`✅ ${method} - Servidor inicializado com sucesso`);
    }

    /**
     * Seed: cria coleções e insere dados iniciais se não existirem.
     */
    #seedDatabase = async () => {
        const method = 'Server.#seedDatabase';
        logger.debug(`🔄 ${method} - Verificando necessidade de seed`);

        try {
            const cargosCollection = await this.#database.getCollection('cargos');
            const funcionariosCollection = await this.#database.getCollection('funcionarios');

            // Verifica se já existem cargos
            const cargoCount = await cargosCollection.countDocuments();
            if (cargoCount === 0) {
                logger.info(`🌱 ${method} - Inserindo cargos iniciais...`);
                const cargos = [
                    { nomeCargo: 'Administrador' },
                    { nomeCargo: 'Técnico em Informática Jr' },
                    { nomeCargo: 'Técnico em Informática Pleno' },
                    { nomeCargo: 'Analista de Sistemas Jr' },
                ];
                const inserted = await cargosCollection.insertMany(cargos);
                const cargoIds = Object.values(inserted.insertedIds);
                logger.debug(`✅ ${method} - ${cargos.length} cargos inseridos`);

                // Verifica se já existem funcionários
                const funcCount = await funcionariosCollection.countDocuments();
                if (funcCount === 0) {
                    logger.info(`🌱 ${method} - Inserindo funcionários iniciais...`);
                    const senhaHash = await bcrypt.hash('@Helio123456', 12);
                    const funcionarios = [
                        { nomeFuncionario: 'adm', email: 'adm@adm.com', senha: senhaHash, recebeValeTransporte: 1, cargoId: cargoIds[0] },
                        { nomeFuncionario: 'adm1', email: 'adm1@adm.com', senha: senhaHash, recebeValeTransporte: 1, cargoId: cargoIds[0] },
                        { nomeFuncionario: 'Hélio', email: 'helioesperidiao@gmail.com', senha: senhaHash, recebeValeTransporte: 1, cargoId: cargoIds[0] },
                    ];
                    await funcionariosCollection.insertMany(funcionarios);
                    logger.info(`✅ ${method} - Seed concluída com sucesso!`);
                } else {
                    logger.info(`✅ ${method} - Funcionários já existentes, seed parcial.`);
                }
            } else {
                logger.info(`✅ ${method} - Cargos já existentes, seed não executada.`);
            }
        } catch (error) {
            logger.error(`❌ ${method} - Erro durante seed`, {
                error: error.message,
                stack: error.stack,
            });
            throw error;
        }
    };

    setupCargo = () => {
        const method = 'Server.setupCargo';
        logger.info(`⬆️ ${method} - Configurando módulo Cargo`);

        try {
            this.#cargoMiddleware = new CargoMiddleware();
            this.#cargoDAO = new CargoDAOMongo(this.#database);
            this.#cargoService = new CargoService(this.#cargoDAO);
            this.#cargoController = new CargoController(this.#cargoService);
            this.#cargoRouter = new CargoRouter(
                this.#router,
                this.#jwtMiddleware,
                this.#cargoMiddleware,
                this.#cargoController
            );
            this.#app.use("/api/v1/cargos", this.#cargoRouter.createRoutes());
            logger.info(`✅ ${method} - Rotas de Cargo configuradas com sucesso`);
        } catch (error) {
            logger.error(`❌ ${method} - Erro ao configurar Cargo`, {
                error: error.message,
                stack: error.stack,
            });
            throw error;
        }
    };

    setupFuncionario = () => {
        const method = 'Server.setupFuncionario';
        logger.info(`⬆️ ${method} - Configurando módulo Funcionario`);

        try {
            this.#funcionarioMiddleware = new FuncionarioMiddleware();
            this.#funcionarioDAO = new FuncionarioDAOMongo(this.#database);

            // Garante que cargoDAO exista (já criado em setupCargo)
            if (!this.#cargoDAO) {
                logger.warn(`⚠️ ${method} - CargoDAO não encontrado, criando nova instância`);
                this.#cargoDAO = new CargoDAOMongo(this.#database);
            }

            this.#funcionarioService = new FuncionarioService(this.#funcionarioDAO, this.#cargoDAO);
            this.#funcionarioController = new FuncionarioController(this.#funcionarioService);
            this.#funcionarioRouter = new FuncionarioRouter(
                this.#jwtMiddleware,
                this.#funcionarioMiddleware,
                this.#funcionarioController
            );
            this.#app.use("/api/v1/funcionarios", this.#funcionarioRouter.createRoutes());
            logger.info(`✅ ${method} - Rotas de Funcionario configuradas com sucesso`);
        } catch (error) {
            logger.error(`❌ ${method} - Erro ao configurar Funcionario`, {
                error: error.message,
                stack: error.stack,
            });
            throw error;
        }
    };

    beforeRouting = () => {
        this.#app.use((req, res, next) => {
            logger.debug(`📥 ${req.method} ${req.originalUrl}`, {
                method: req.method,
                url: req.originalUrl,
                ip: req.ip,
                userAgent: req.headers['user-agent'],
            });
            next();
        });
    };

    setupErrorMiddleware = () => {
        const method = 'Server.setupErrorMiddleware';
        logger.info(`⬆️ ${method} - Configurando middleware de tratamento de erros`);

        this.#app.use((error, request, response, next) => {
            if (error instanceof ErrorResponse) {
                logger.warn(`⚠️ ${method} - Erro customizado capturado`, {
                    httpCode: error.httpCode,
                    message: error.message,
                    error: error.error,
                    url: request.originalUrl,
                    method: request.method,
                });
                return response.status(error.httpCode).json({
                    success: false,
                    message: error.message,
                    error: error.error,
                });
            }

            // Erro genérico (não tratado especificamente)
            const resposta = {
                success: false,
                message: "Ocorreu um erro interno no servidor",
                data: { stack: error.stack },
                error: { message: error.message || "Erro interno", code: error.code },
            };

            logger.error(`❌ ${method} - Erro interno não tratado`, {
                error: error.message,
                stack: error.stack,
                code: error.code,
                url: request.originalUrl,
                method: request.method,
                body: request.body,
            });

            response.status(500).json(resposta);
        });
    };

    run = () => {
        const method = 'Server.run';
        this.#app.listen(this.#porta, () => {
            logger.info(`🚀 ${method} - Servidor rodando em http://localhost:${this.#porta}/index.html`);
            console.log(`🚀 Server rodando em http://localhost:${this.#porta}/index.html`);
        });
    };
};