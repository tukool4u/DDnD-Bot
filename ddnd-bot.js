'use strict';

const { ActivityType, Client, GatewayIntentBits, MessageEmbed, MessageActionRow, MessageButton, Partials, codeBlock } = require('discord.js');

const crypto = require('crypto');
const https = require('https');
const fs = require('fs');

const { token } = require('./config.json');

const menus = require('./menus.js');
const game = require('./commands/game.js');

const client = new Client({
	intents: [ GatewayIntentBits.DirectMessages, GatewayIntentBits.DirectMessageReactions, GatewayIntentBits.GuildMembers, GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMessageReactions ],
	partials: [ Partials.Message, Partials.Channel, Partials.Reaction ]
});

process.on('SIGINT', function() {
	console.log('SIGINT received');
	
	console.log(`Destroying DDnD Bot.`);
	
	client.destroy();
});

client.on('ready', () => {
	console.log(`DDnD Bot has started in ${client.guilds.cache.size} servers.`);
	
	client.user.setActivity(`${client.guilds.cache.size} servers for adventurers.`, ({ type: ActivityType.Watching }));
});

client.on('error', (error) => {
    console.error(error);
});

client.on('guildCreate', guild => {
	console.log(`DDnD Bot added to ${client.guilds.fetch(guild.id).name}(${guild.id}).`);
	
	client.channels.fetch('1031635144580276325').send(`Opso Bot added to ${client.guilds.fetch(guild.id).name}(${guild.id}).`);
  
	client.user.setActivity(`${client.guilds.cache.size} servers for adventurers.`, ({ type: ActivityType.Watching }));
});

client.on('guildDelete', guild => {
	console.log(`DDnD Bot removed for ${client.guilds.fetch(guild.id).name}(${guild.id}).`);
	
	client.channels.fetch('1031635144580276325').send(`DDnD Bot removed from ${client.guilds.fetch(guild.id).name}(${guild.id}).`);
  
	client.user.setActivity(`${client.guilds.cache.size} servers for adventurers.`, ({ type: ActivityType.Watching }));
});

client.on('interactionCreate', async interaction => {
	// handle button interactions
	if (interaction.isButton()) {
		if (interaction.customId === 'ACK') {
			interaction.update({ ephemeral: false, embeds: [ await menus.getScenarioEmbed() ], components: [] });
		} else {
			interaction.update({ ephemeral: true, embeds: [], components: [], content: 'You big baby. Oh well, maybe another time.' });
		}
	}
	
	// filter non-command interactions
	if (!interaction.isCommand() && !interaction.isSelectMenu()) return;
	
	// begin command interface
	if (interaction.commandName === 'play') {
		try {
			await game.execute(interaction);
		} catch (e) {
			// log error
			console.error(e);
			
			// update interaction to clear embeds/components and inform user of error
			interaction.reply({ ephemeral: true, embeds: [], components: [], content: 'There was a problem starting the game. The powers at be have been notified.' });
			
			// log to discord
			client.channels.fetch('1031635144580276325').then(c => c.send(`${codeBlock(e.stack)}`));
		}
	}
});

client.on('messageCreate', async message => {
	
	if (!message.author.bot && message.channel.name.toLowerCase().includes('flight plans')) {
		const author = message.member.nickname ? message.member.nickname : message.author.username;
				
		// get all messages - TODO: improve fetch; will bottleneck with many messages
		const messages = await message.channel.messages.fetch();
		
		// find all messages with embeds, then get the newest message by the user
		const d = messages.filter(msg => msg.embeds.length > 0).filter(m => author === m.embeds[0].author.name).first();
		
		// create new embed per https://discordjs.guide/popular-topics/embeds.html#using-an-embed-object-1
		const tempEmbed = new MessageEmbed(d.embeds[0]);
		
		// do not update cancelation notices
		if (!tempEmbed.title.toLowerCase().includes("canceled")) {
			// save image
			downloadImageFromDiscord(message.attachments.first().url)
				.then(filename => {
					// copy image to storage channel and update flight plan
					const msg = message.guild.channels.cache.find(channel => channel.name === 'plan-pictures').send({ files: [ filename ] }).then(m => {
						// update embed with flight plan image
						tempEmbed.setImage(m.attachments.first().url);
					
						// update the message
						d.edit({ embeds: [tempEmbed] });
					});
				}).catch(e => {
					// log error
					console.error(e);
					
					// update interaction to clear embeds/components and inform user of error
					message.author.send('There was a problem getting your flight plan image from Discord. tukool has been notified.');
					
					// log to discord
					client.channels.fetch('972510091242766396').then(c => c.send(`${codeBlock(e.stack)}`));
				});
		}
		
		// delete the posted image
		message.delete();
    }	
});

// login to activate client
client.login(token);