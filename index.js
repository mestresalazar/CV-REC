try { require('dotenv').config(); } catch (e) {}

// SISTEMA DE SEGURANÇA: Impede que o bot desligue no Render em caso de erro na API do Discord
process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ Erro não tratado detectado (o bot continuará rodando):', reason);
});

process.on('uncaughtException', (err, origin) => {
    console.error('⚠️ Exceção crítica detectada (o bot continuará rodando):', err);
});

const { 
    Client, 
    GatewayIntentBits, 
    Partials, 
    Collection, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ChannelType, 
    PermissionFlagsBits, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle 
} = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Channel, Partials.Message]
});

const activeTests = new Collection(); 
const cooldowns = new Collection();   

let globalLogChannelId = null;
let globalAvisoChannelId = null;
let customAvisoText = "O sistema de recrutamento automático está online! Venha fazer parte da nossa equipe. Clique no botão abaixo para iniciar o seu cadastro e teste de regras diretamente nas suas Mensagens Diretas (DM)."; 
let lastAvisoMessageId = null;
let avisoIntervalRef = null;

const WHATSAPP_LINK = 'https://chat.whatsapp.com/GY4cW23NQt41oTNHBhgSCI?s=cl&p=a&mlu=4'; 

const baseQuizQuestions = [
    {
        question: 'O que significa a regra de **RDM** (Random Deathmatch)?\n\n1️⃣ Matar ou agredir outro jogador sem uma justificativa/motivo válido de RP.\n2️⃣ Bater o carro de propósito em alta velocidade nos outros.\n3️⃣ Abandonar o jogo no meio de uma abordagem policial.',
        correct: '1'
    },
    {
        question: 'O que caracteriza a infração de **VDM** (Vehicle Deathmatch)?\n\n1️⃣ Usar o veículo estritamente para fuga em alta velocidade.\n2️⃣ Atropelar, usar o carro como arma ou matar outros jogadores com o veículo sem motivo justo de RP.\n3️⃣ Estacionar em local proibido na praça central.',
        correct: '2'
    },
    {
        question: 'O que significa a regra de **RK** (Revenge Kill)?\n\n1️⃣ Vingar-se ou retornar ao local onde o seu personagem morreu para matar quem o matou, usando memórias da vida passada.\n2️⃣ Matar um policial em legítima defesa durante um assalto a banco.\n3️⃣ Ligar para o SAMU após sofrer um acidente.',
        correct: '1'
    },
    {
        question: 'O que é a infração de **SK** (Spawn Kill)?\n\n1️⃣ Matar jogadores na zona segura ou no exato local de renascimento/spawn deles.\n2️⃣ Matar um refém após negociação falhar.\n3️⃣ Atirar em uma perseguição policial em andamento.',
        correct: '1'
    },
    {
        question: 'Se você sofrer um acidente grave de carro, qual deve ser a sua atitude imediata baseada no **Amor à Vida (FearRP)**?\n\n1️⃣ Levantar imediatamente e continuar correndo atrás do suspeito.\n2️⃣ Interpretar os ferimentos, valorizar a vida do seu personagem e aguardar atendimento médico.\n3️⃣ Xingar o motorista no chat OOC.',
        correct: '2'
    },
    {
        question: 'O que é considerado **Powergaming**?\n\n1️⃣ Falar palavrões no chat de voz global.\n2️⃣ Realizar ações irreais, sobre-humanas ou que o seu personagem não poderia fazer na vida real.\n3️⃣ Trabalhar em dois empregos ao mesmo tempo.',
        correct: '2'
    },
    {
        question: 'O que significa fazer **Metagaming**?\n\n1️⃣ Usar informações que o seu personagem descobriu fora do jogo (Discord, Stream, etc) dentro do RP.\n2️⃣ Trocar de roupa na loja de departamentos.\n3️⃣ Comprar um veículo importado.',
        correct: '1'
    },
    {
        question: 'O que é o **Combat Logging**?\n\n1️⃣ Dormir na sua casa no jogo para recuperar energia.\n2️⃣ Desconectar do jogo (dar ALT+F4) para evitar uma situação de RP, abordagem ou morte.\n3️⃣ Entrar no servidor fora do horário de pico.',
        correct: '2'
    },
    {
        question: 'Qual é a conduta correta ao entrar em uma **Safe Zone (Zona Segura)**?\n\n1️⃣ Iniciar um tiroteio se houver desafetos por perto.\n2️⃣ Respeitar a proibição absoluta de qualquer ato agressivo, roubo ou homicídio.\n3️⃣ Roubar carros que estiverem destrancados na área.',
        correct: '2'
    },
    {
        question: 'O que significa agir com **Ações Irrealistas (Non-RP)**?\n\n1️⃣ Executar manobras absurdas com veículos comuns (como saltar de penhascos enormes e continuar andando normalmente).\n2️⃣ Trabalhar honestamente como entregador.\n3️⃣ Seguir todas as leis de trânsito da cidade.',
        correct: '1'
    }
];

function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

async function getLogChannel(guild) {
    if (!guild) return null;
    if (globalLogChannelId) {
        const ch = await guild.channels.fetch(globalLogChannelId).catch(() => null);
        if (ch) return ch;
    }
    const found = guild.channels.cache.find(c => c.name === 'resultados-aprovados-reprovados' && c.type === ChannelType.GuildText);
    if (found) {
        globalLogChannelId = found.id;
        return found;
    }
    return null;
}

async function enviarAvisoRecrutamento(guildOrClient) {
    try {
        if (!globalAvisoChannelId) return false;
        
        const avisoChannel = await guildOrClient.channels.fetch(globalAvisoChannelId).catch(() => null);
        if (!avisoChannel) return false;

        if (lastAvisoMessageId) {
            const oldMsg = await avisoChannel.messages.fetch(lastAvisoMessageId).catch(() => null);
            if (oldMsg) {
                await oldMsg.delete().catch(() => {});
            }
            lastAvisoMessageId = null;
        }

        const embedAviso = new EmbedBuilder()
            .setTitle('📢 RECRUTAMENTO BMRP ABERTO 24H!')
            .setDescription(customAvisoText)
            .setColor('#00FF00')
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('start_quiz')
                .setLabel('Fazer Prova / Teste')
                .setStyle(ButtonStyle.Success)
                .setEmoji('🚀')
        );

        const novaMensagem = await avisoChannel.send({ 
            content: '@everyone', 
            embeds: [embedAviso], 
            components: [row],
            allowedMentions: { parse: ['everyone'] }
        });

        lastAvisoMessageId = novaMensagem.id;
        return avisoChannel;
    } catch (err) {
        console.error('Erro ao enviar aviso automático:', err);
        return false;
    }
}

function reiniciarTimerAviso(clientInstance) {
    if (avisoIntervalRef) clearInterval(avisoIntervalRef);
    
    avisoIntervalRef = setInterval(async () => {
        if (!globalAvisoChannelId) return;
        const channel = await clientInstance.channels.fetch(globalAvisoChannelId).catch(() => null);
        if (channel) {
            await enviarAvisoRecrutamento(channel.guild);
        }
    }, 1 * 60 * 60 * 1000);
}

client.once('clientReady', () => {
    console.log(`Bot online como ${client.user.tag}!`);
});

client.on('guildMemberAdd', async member => {
    try {
        const roleName = 'Cria do CV'; 
        const role = member.guild.roles.cache.find(r => r.name.toLowerCase() === roleName.toLowerCase());

        if (role) {
            await member.roles.add(role);
        }
    } catch (error) {
        console.error('[AUTOROLE] Erro:', error);
    }
});

// COMANDOS NO SERVIDOR
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    if (message.content.startsWith('!setartag')) {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply('❌ Você precisa ser Administrador para usar este comando.');
        }

        const role = message.mentions.roles.first();
        if (!role) {
            return message.reply('⚠️ Por favor, marque o cargo/tag que deseja setar. Exemplo: `!setartag @Cria do CV`');
        }

        try {
            await message.reply(`🔄 Processando: Adicionando o cargo **${role.name}** em todos os membros e atualizando permissões...`);
            await message.guild.members.fetch();
            const members = message.guild.members.cache.filter(member => !member.user.bot);

            let addedCount = 0;
            for (const [id, member] of members) {
                if (!member.roles.cache.has(role.id)) {
                    try { await member.roles.add(role); addedCount++; } catch (err) {}
                }
            }

            const categories = message.guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory);
            let updatedCategoriesCount = 0;

            for (const [id, category] of categories) {
                const catName = category.name.toUpperCase();
                if (catName.includes('RECRUTAMENTO') || catName.includes('ENCOMENDAS') || catName.includes('VOZ') || catName.includes('ORG')) {
                    await category.permissionOverwrites.set([
                        { id: message.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                        { id: role.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] }
                    ]);
                    updatedCategoriesCount++;
                }
            }

            await message.channel.send(`✅ **Sucesso!** Cargo adicionado a **${addedCount}** membros e permissões ajustadas em **${updatedCategoriesCount}** categorias.`);
        } catch (error) {
            console.error(error);
            message.reply('❌ Ocorreu um erro ao processar o comando.');
        }
    }

    if (message.content.startsWith('!avisar')) {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply('❌ Você precisa ser Administrador para usar este comando.');
        }

        const textoCustomizado = message.content.slice('!avisar'.length).trim();
        if (textoCustomizado) {
            customAvisoText = textoCustomizado;
        }

        if (!globalAvisoChannelId) {
            return message.reply('⚠️ O canal de avisos gerais ainda não foi criado! Use o comando `!criaraviso` primeiro.');
        }

        const canalEnviado = await enviarAvisoRecrutamento(message.guild);
        reiniciarTimerAviso(client);

        if (canalEnviado) {
            return message.reply(`✅ Aviso disparado com sucesso! O ciclo de 1 hora foi reiniciado. Veja na aba correspondente: <#${globalAvisoChannelId}>`);
        } else {
            return message.reply('❌ Erro ao enviar o aviso. Verifique se o canal de avisos ainda existe.');
        }
    }

    if (message.content === '!criarbotoesencomendas') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply('❌ Apenas administradores.');
        const channelName = message.channel.name.toLowerCase();

        if (channelName.includes('drogas')) {
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('order_drugs').setLabel('Fazer Encomenda de Drogas').setStyle(ButtonStyle.Success).setEmoji('🌿'));
            await message.channel.send({ embeds: [new EmbedBuilder().setTitle('🌿 Encomenda de Drogas').setColor('#2ecc71')], components: [row] });
            return message.reply('✅ Botão gerado!');
        } else if (channelName.includes('armamentos') || channelName.includes('armas')) {
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('order_weapons').setLabel('Fazer Encomenda de Armas').setStyle(ButtonStyle.Danger).setEmoji('🔫'));
            await message.channel.send({ embeds: [new EmbedBuilder().setTitle('🔫 Encomenda de Armamentos').setColor('#e74c3c')], components: [row] });
            return message.reply('✅ Botão gerado!');
        } else if (channelName.includes('explosivos')) {
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('order_explosives').setLabel('Fazer Encomenda de Explosivos').setStyle(ButtonStyle.Primary).setEmoji('💣'));
            await message.channel.send({ embeds: [new EmbedBuilder().setTitle('💣 Encomenda de Explosivos').setColor('#e67e22')], components: [row] });
            return message.reply('✅ Botão gerado!');
        } else {
            return message.reply('⚠️ Execute dentro de um canal específico de encomendas.');
        }
    }

    if (message.content === '!clonarcategoriaencomendas') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return;
        try {
            await message.reply('🔍 Criando estruturas...');
            const catInfo = await message.guild.channels.create({ name: '📌 INFORMAÇÕES E REQUISITOS', type: ChannelType.GuildCategory });
            await message.guild.channels.create({ name: 'requisitos-gerais', type: ChannelType.GuildText, parent: catInfo.id });
            await message.guild.channels.create({ name: 'desempenho-membros', type: ChannelType.GuildText, parent: catInfo.id });

            const catEncomendas = await message.guild.channels.create({ name: '📦 CENTRAL DE ENCOMENDAS', type: ChannelType.GuildCategory });
            await message.guild.channels.create({ name: 'tabela-de-valores', type: ChannelType.GuildText, parent: catEncomendas.id });

            const chanDrogas = await message.guild.channels.create({ name: 'encomenda-drogas', type: ChannelType.GuildText, parent: catEncomendas.id });
            await chanDrogas.send({ embeds: [new EmbedBuilder().setTitle('🌿 Encomenda de Drogas').setColor('#2ecc71')], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('order_drugs').setLabel('Fazer Encomenda de Drogas').setStyle(ButtonStyle.Success).setEmoji('🌿'))] });

            const chanArmas = await message.guild.channels.create({ name: 'encomenda-armamentos', type: ChannelType.GuildText, parent: catEncomendas.id });
            await chanArmas.send({ embeds: [new EmbedBuilder().setTitle('🔫 Encomenda de Armamentos').setColor('#e74c3c')], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('order_weapons').setLabel('Fazer Encomenda de Armas').setStyle(ButtonStyle.Danger).setEmoji('🔫'))] });

            const chanExplosivos = await message.guild.channels.create({ name: 'encomenda-explosivos', type: ChannelType.GuildText, parent: catEncomendas.id });
            await chanExplosivos.send({ embeds: [new EmbedBuilder().setTitle('💣 Encomenda de Explosivos').setColor('#e67e22')], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('order_explosives').setLabel('Fazer Encomenda de Explosivos').setStyle(ButtonStyle.Primary).setEmoji('💣'))] });

            await message.reply('✅ Categorias de encomendas geradas.');
        } catch (error) {
            console.error(error);
            message.reply('❌ Erro ao criar categorias.');
        }
    }

    if (message.content === '!criarcategoria') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return;
        const category = await message.guild.channels.create({ name: 'RECRUTAMENTO BMRP', type: ChannelType.GuildCategory });
        const textChannel = await message.guild.channels.create({ name: 'fazer-teste', type: ChannelType.GuildText, parent: category.id });
        const embed = new EmbedBuilder().setTitle('📝 Prova de Recrutamento 24h - BMRP').setDescription('Clique no botão abaixo para iniciar o teste.').setColor('#2b2d31');
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('start_quiz').setLabel('Iniciar Teste / Prova').setStyle(ButtonStyle.Success).setEmoji('🚀'));
        await textChannel.send({ embeds: [embed], components: [row] });
        await message.reply('✅ Categoria de testes criada.');
    }

    if (message.content === '!criarlog') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return;
        const categoryLogs = await message.guild.channels.create({ name: 'LOGS DE RECRUTAMENTO', type: ChannelType.GuildCategory });
        const logChannel = await message.guild.channels.create({ name: 'resultados-aprovados-reprovados', type: ChannelType.GuildText, parent: categoryLogs.id });
        globalLogChannelId = logChannel.id;
        await message.reply(`✅ Canal de logs criado em <#${logChannel.id}>.`);
    }

    if (message.content.startsWith('!criaraviso')) {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return;
        const args = message.content.slice('!criaraviso'.length).trim();
        if (args) customAvisoText = args; 

        const categoryAviso = await message.guild.channels.create({ name: 'AVISOS GERAIS', type: ChannelType.GuildCategory });
        const avisoChannel = await message.guild.channels.create({ name: 'recrutamento-online', type: ChannelType.GuildText, parent: categoryAviso.id });
        globalAvisoChannelId = avisoChannel.id;

        await enviarAvisoRecrutamento(message.guild);
        reiniciarTimerAviso(client);

        await message.reply(`✅ Canal de avisos criado em <#${avisoChannel.id}> e temporizador de 1 em 1 hora ativado.`);
    }

    if (message.content.startsWith('!tirarcooldown')) {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return;
        const targetUser = message.mentions.users.first();
        if (!targetUser) return message.reply('⚠️ Marque o usuário. Ex: `!tirarcooldown @usuario`');
        if (cooldowns.has(targetUser.id)) {
            cooldowns.delete(targetUser.id);
            return message.reply(`✅ Cooldown de **${targetUser.tag}** removido!`);
        } else {
            return message.reply(`⚠️ O usuário não está em cooldown.`);
        }
    }
});

// INTERAÇÕES (BOTÕES E FORMULÁRIOS)
client.on('interactionCreate', async interaction => {
    
    // BOTÃO: Iniciar Prova / Teste
    if (interaction.isButton() && interaction.customId === 'start_quiz') {
        const userId = interaction.user.id;

        if (cooldowns.has(userId)) {
            const expirationTime = cooldowns.get(userId);
            if (Date.now() < expirationTime) {
                const hoursLeft = Math.ceil((expirationTime - Date.now()) / (1000 * 60 * 60));
                return interaction.reply({ content: `❌ Você foi reprovado recentemente. Tente novamente em **${hoursLeft}h**.`, ephemeral: true }).catch(() => {});
            } else {
                cooldowns.delete(userId); 
            }
        }

        if (activeTests.has(userId)) {
            return interaction.reply({ content: '⚠️ Você já possui um processo de recrutamento ativo nas suas DMs!', ephemeral: true }).catch(() => {});
        }

        // Modal para coletar os dados do candidato
        const modalReg = new ModalBuilder().setCustomId('modal_registration_quiz').setTitle('📋 Cadastro de Recrutamento');

        const inputNome = new TextInputBuilder().setCustomId('reg_nome').setLabel('Qual é o seu Nome Real?').setStyle(TextInputStyle.Short).setRequired(true);
        const inputNick = new TextInputBuilder().setCustomId('reg_nick').setLabel('Qual é o seu Nick no Jogo?').setStyle(TextInputStyle.Short).setRequired(true);
        const inputLevel = new TextInputBuilder().setCustomId('reg_level').setLabel('Qual é o seu Level no Jogo?').setStyle(TextInputStyle.Short).setRequired(true);
        const inputTempo = new TextInputBuilder().setCustomId('reg_tempo').setLabel('Há quanto tempo joga no servidor?').setStyle(TextInputStyle.Short).setRequired(true);

        modalReg.addComponents(
            new ActionRowBuilder().addComponents(inputNome),
            new ActionRowBuilder().addComponents(inputNick),
            new ActionRowBuilder().addComponents(inputLevel),
            new ActionRowBuilder().addComponents(inputTempo)
        );

        try {
            return await interaction.showModal(modalReg);
        } catch (err) {
            console.error('Erro ao exibir o modal de recrutamento:', err);
        }
    }

    // BOTÕES DA PROVA NA DM (1, 2 ou 3)
    if (interaction.isButton() && interaction.customId.startsWith('quiz_opt_')) {
        const test = activeTests.get(interaction.user.id);
        if (!test) {
            return interaction.reply({ content: '⚠️ Seu teste não foi localizado ou já foi concluído.', ephemeral: true }).catch(() => {});
        }

        const selectedOpt = interaction.customId.replace('quiz_opt_', '');
        const currentQ = test.questions[test.step];

        if (selectedOpt === currentQ.correct) {
            test.score++;
        }

        test.step++;
        const totalQ = test.questions.length;

        if (test.step < totalQ) {
            const nextQ = test.questions[test.step];
            const embedQuestion = new EmbedBuilder()
                .setTitle(`📝 Prova de Regras BMRP - Questão ${test.step + 1}/${totalQ}`)
                .setDescription(`**Pergunta:** ${nextQ.question}`)
                .setColor('#0099FF')
                .setFooter({ text: 'Clique no botão da opção correspondente abaixo.' });

            const rowButtons = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('quiz_opt_1').setLabel('1️⃣ Alternativa 1').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('quiz_opt_2').setLabel('2️⃣ Alternativa 2').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('quiz_opt_3').setLabel('3️⃣ Alternativa 3').setStyle(ButtonStyle.Primary)
            );

            await interaction.update({ embeds: [embedQuestion], components: [rowButtons] }).catch(() => {});
        } else {
            // Finalização do Teste
            let status = '';
            let color = '#00FF00';

            if (test.score > 5) {
                status = '✅ **APROVADO**';
            } else if (test.score === 5) {
                status = '⚠️ **APROVADO COM OBSERVAÇÃO**';
                color = '#FFFF00';
            } else {
                status = '❌ **REPROVADO**';
                color = '#FF0000';
                cooldowns.set(interaction.user.id, Date.now() + (5 * 60 * 60 * 1000));
            }

            let descResult = `**Resultado:** ${status}\n**Pontuação:** **${test.score}/${totalQ}** acertos.\n\n`;

            if (test.score >= 5) {
                descResult += `🎉 Parabéns! Entre no nosso grupo do WhatsApp:\n${WHATSAPP_LINK}`;
            } else {
                descResult += `Você não atingiu a pontuação mínima necessária. Poderá tentar novamente em **5 horas**.`;
            }

            const embedFinal = new EmbedBuilder()
                .setTitle('📋 RESULTADO DA PROVA DE RECRUTAMENTO')
                .setDescription(descResult)
                .setColor(color)
                .setTimestamp();

            await interaction.update({ embeds: [embedFinal], components: [] }).catch(() => {});

            // Envia Log
            let logChannel = await getLogChannel(test.guild);
            if (logChannel) {
                const embedLog = new EmbedBuilder()
                    .setTitle(`RESULTADO: ${status.replace(/\*/g, '')}`)
                    .setColor(color)
                    .addFields(
                        { name: '👤 Discord', value: `<@${interaction.user.id}>`, inline: false },
                        { name: '📝 Nome', value: test.data.nome, inline: true },
                        { name: '🎮 Nick', value: test.data.nick, inline: true },
                        { name: '⭐ Level', value: test.data.level, inline: true },
                        { name: '⏳ Tempo no Servidor', value: test.data.tempo, inline: true },
                        { name: '📊 Acertos', value: `${test.score}/${totalQ}`, inline: false }
                    )
                    .setTimestamp();
                await logChannel.send({ embeds: [embedLog] }).catch(() => {});
            }

            activeTests.delete(interaction.user.id);
        }
    }

    // SUBMIT DO MODAL DE CADASTRO
    if (interaction.isModalSubmit() && interaction.customId === 'modal_registration_quiz') {
        const nome = interaction.fields.getTextInputValue('reg_nome');
        const nick = interaction.fields.getTextInputValue('reg_nick');
        const level = interaction.fields.getTextInputValue('reg_level');
        const tempo = interaction.fields.getTextInputValue('reg_tempo');

        const shuffledQuestions = shuffleArray(baseQuizQuestions);
        const firstQ = shuffledQuestions[0];

        const embedQuestion = new EmbedBuilder()
            .setTitle(`📝 Prova de Regras BMRP - Questão 1/${shuffledQuestions.length}`)
            .setDescription(`**Pergunta:** ${firstQ.question}`)
            .setColor('#0099FF')
            .setFooter({ text: 'Clique no botão da opção correspondente abaixo.' });

        const rowButtons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('quiz_opt_1').setLabel('1️⃣ Alternativa 1').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('quiz_opt_2').setLabel('2️⃣ Alternativa 2').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('quiz_opt_3').setLabel('3️⃣ Alternativa 3').setStyle(ButtonStyle.Primary)
        );

        try {
            const dmChannel = await interaction.user.createDM();
            await dmChannel.send({ embeds: [embedQuestion], components: [rowButtons] });

            activeTests.set(interaction.user.id, {
                step: 0,
                score: 0,
                data: { nome, nick, level, tempo },
                questions: shuffledQuestions,
                guild: interaction.guild
            });

            await interaction.reply({ content: '✅ **Cadastro concluído!** A prova foi enviada para suas **Mensagens Diretas (DMs)** em formato de painel com botões.', ephemeral: true }).catch(() => {});
        } catch (err) {
            await interaction.reply({ content: '❌ Não consegui enviar mensagem nas suas DMs. Certifique-se de que suas **Mensagens Diretas estão ABERTAS** nas configurações do Discord.', ephemeral: true }).catch(() => {});
        }
    }

    // SISTEMA DE ENCOMENDAS
    if (interaction.isButton() && (interaction.customId === 'order_drugs' || interaction.customId === 'order_weapons' || interaction.customId === 'order_explosives')) {
        const modalMap = {
            'order_drugs': { id: 'modal_drugs', title: '🌿 Encomenda de Drogas' },
            'order_weapons': { id: 'modal_weapons', title: '🔫 Encomenda de Armamentos' },
            'order_explosives': { id: 'modal_explosives', title: '💣 Encomenda de Explosivos' }
        };
        const target = modalMap[interaction.customId];
        const modal = new ModalBuilder().setCustomId(target.id).setTitle(target.title);

        const itemInput = new TextInputBuilder().setCustomId('item_name').setLabel('Qual item e quantidade?').setStyle(TextInputStyle.Short).setRequired(true);
        const obsInput = new TextInputBuilder().setCustomId('item_obs').setLabel('Observações ou local de entrega').setStyle(TextInputStyle.Paragraph).setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(itemInput), new ActionRowBuilder().addComponents(obsInput));
        try {
            return await interaction.showModal(modal);
        } catch (err) {
            console.error('Erro ao exibir modal de encomenda:', err);
        }
    }

    if (interaction.isButton() && interaction.customId.startsWith('accept_order_')) {
        const orderId = interaction.customId.replace('accept_order_', '');
        const modal = new ModalBuilder().setCustomId(`modal_accept_${orderId}`).setTitle('⏱️ Assumir Encomenda');
        const timeInput = new TextInputBuilder().setCustomId('delivery_time').setLabel('Em quanto tempo vai entregar?').setStyle(TextInputStyle.Short).setPlaceholder('Ex: 15 minutos').setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(timeInput));
        try {
            return await interaction.showModal(modal);
        } catch (err) {
            console.error('Erro ao exibir modal de aceitar encomenda:', err);
        }
    }

    if (interaction.isModalSubmit()) {
        const orderTypeMap = {
            'modal_drugs': { title: '🌿 Nova Encomenda de Drogas', color: '#2ecc71' },
            'modal_weapons': { title: '🔫 Nova Encomenda de Armamentos', color: '#e74c3c' },
            'modal_explosives': { title: '💣 Nova Encomenda de Explosivos', color: '#e67e22' }
        };

        const config = orderTypeMap[interaction.customId];
        if (config) {
            const itemName = interaction.fields.getTextInputValue('item_name');
            const itemObs = interaction.fields.getTextInputValue('item_obs');

            const embedOrder = new EmbedBuilder()
                .setTitle(config.title)
                .setColor(config.color)
                .addFields(
                    { name: '👤 Solicitante', value: `${interaction.user} (\`${interaction.user.tag}\`)`, inline: false },
                    { name: '📦 Pedido', value: itemName, inline: false },
                    { name: '📝 Observações', value: itemObs, inline: false }
                )
                .setTimestamp();

            const uniqueId = Date.now().toString();
            const rowAccept = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`accept_order_${uniqueId}`)
                    .setLabel('Pegar Encomenda')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('📦')
            );

            await interaction.reply({ content: '✅ Sua encomenda foi registrada e enviada para a organização!', ephemeral: true }).catch(() => {});

            let targetChannel = interaction.channel;
            const foundPedidos = interaction.guild.channels.cache.find(c => c.name.toLowerCase().includes('pedidos-recebidos') && c.type === ChannelType.GuildText);
            if (foundPedidos) targetChannel = foundPedidos;

            await targetChannel.send({ embeds: [embedOrder], components: [rowAccept] }).catch(() => {});
        }

        if (interaction.customId.startsWith('modal_accept_')) {
            const deliveryTime = interaction.fields.getTextInputValue('delivery_time');
            const originalEmbed = interaction.message.embeds[0];
            if (!originalEmbed) return interaction.reply({ content: '❌ Erro ao localizar dados.', ephemeral: true }).catch(() => {});

            const embedAndamento = new EmbedBuilder()
                .setTitle('⏳ Encomenda em Andamento')
                .setColor('#f1c40f')
                .addFields(
                    ...originalEmbed.fields,
                    { name: '🛡️ Membro Responsável', value: `${interaction.user} (\`${interaction.user.tag}\`)`, inline: false },
                    { name: '⏱️ Prazo de Entrega', value: deliveryTime, inline: false }
                )
                .setTimestamp();

            let andamentoChannel = interaction.channel;
            const foundAndamento = interaction.guild.channels.cache.find(c => c.name.toLowerCase().includes('pedidos-em-andamento') && c.type === ChannelType.GuildText);
            if (foundAndamento) andamentoChannel = foundAndamento;

            await andamentoChannel.send({ embeds: [embedAndamento] }).catch(() => {});
            await interaction.reply({ content: `✅ Você assumiu esta encomenda! Enviado para <#${andamentoChannel.id}>.`, ephemeral: true }).catch(() => {});
            await interaction.message.delete().catch(() => {});
        }
    }
});

// LOGIN DO BOT VIA VARIÁVEL DE AMBIENTE
client.login(process.env.DISCORD_TOKEN);
