class GameClient {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.worldImage = null;
        this.worldWidth = 2048;
        this.worldHeight = 2048;
        
        // Game state
        this.players = new Map();
        this.avatars = new Map();
        this.myPlayerId = null;
        this.myPlayer = null;
        
        // NPCs
        this.npcs = new Map();
        this.npcAvatars = new Map();
        
        
        // Viewport/camera
        this.viewport = {
            x: 0,
            y: 0,
            width: 0,
            height: 0
        };
        
        // WebSocket
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        
        this.init();
    }
    
    init() {
        this.setupCanvas();
        this.loadWorldMap();
        this.setupEventListeners();
        this.startGameLoop();
        this.connectToServer();
    }
    
    setupCanvas() {
        // Set canvas size to fill the browser window
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        
        // Update viewport dimensions
        this.viewport.width = this.canvas.width;
        this.viewport.height = this.canvas.height;
        
        // Handle window resize
        window.addEventListener('resize', () => {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
            this.viewport.width = this.canvas.width;
            this.viewport.height = this.canvas.height;
            this.updateViewport();
            this.draw();
        });
    }
    
    loadWorldMap() {
        this.worldImage = new Image();
        this.worldImage.onload = () => {
            this.draw();
        };
        this.worldImage.src = 'world.jpg';
    }
    
    // WebSocket connection methods
    connectToServer() {
        try {
            this.ws = new WebSocket('wss://codepath-mmorg.onrender.com');
            
            this.ws.onopen = () => {
                console.log('Connected to game server');
                this.reconnectAttempts = 0;
                this.joinGame();
            };
            
            this.ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    this.handleServerMessage(message);
                } catch (error) {
                    console.error('Error parsing server message:', error);
                }
            };
            
            this.ws.onclose = () => {
                console.log('Disconnected from game server');
                this.attemptReconnect();
            };
            
            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
            };
            
        } catch (error) {
            console.error('Failed to connect to server:', error);
            this.attemptReconnect();
        }
    }
    
    attemptReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`Attempting to reconnect... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
            setTimeout(() => {
                this.connectToServer();
            }, 2000 * this.reconnectAttempts);
        } else {
            console.error('Max reconnection attempts reached');
        }
    }
    
    joinGame() {
        const joinMessage = {
            action: 'join_game',
            username: 'Crystal'
        };
        
        this.ws.send(JSON.stringify(joinMessage));
        console.log('Sent join_game message');
    }
    
    handleServerMessage(message) {
        switch (message.action) {
            case 'join_game':
                if (message.success) {
                    this.handleJoinGameSuccess(message);
                } else {
                    console.error('Join game failed:', message.error);
                }
                break;
            case 'player_joined':
                this.handlePlayerJoined(message);
                break;
            case 'players_moved':
                this.handlePlayersMoved(message);
                break;
            case 'player_left':
                this.handlePlayerLeft(message);
                break;
            default:
                console.log('Unknown message type:', message.action);
        }
    }
    
    handleJoinGameSuccess(message) {
        this.myPlayerId = message.playerId;
        
        // Store all players
        for (const [playerId, playerData] of Object.entries(message.players)) {
            this.players.set(playerId, playerData);
            if (playerId === this.myPlayerId) {
                this.myPlayer = playerData;
            }
        }
        
        // Store avatar data
        for (const [avatarName, avatarData] of Object.entries(message.avatars)) {
            this.avatars.set(avatarName, avatarData);
        }
        
        // Load avatar images
        this.loadAvatarImages();
        
        // Create NPCs now that we have a player position
        this.createNPCs();
        
        // Update viewport to center on our player
        this.updateViewport();
        
        console.log('Successfully joined game as', this.myPlayer.username);
        this.draw();
    }
    
    handlePlayerJoined(message) {
        this.players.set(message.player.id, message.player);
        this.avatars.set(message.avatar.name, message.avatar);
        this.loadAvatarImages();
        this.draw();
    }
    
    handlePlayersMoved(message) {
        for (const [playerId, playerData] of Object.entries(message.players)) {
            this.players.set(playerId, playerData);
            
            // If it's our player, update the viewport
            if (playerId === this.myPlayerId) {
                this.myPlayer = playerData;
                this.updateViewport();
            }
        }
        this.draw();
    }
    
    handlePlayerLeft(message) {
        this.players.delete(message.playerId);
        this.draw();
    }
    
    loadAvatarImages() {
        for (const [avatarName, avatarData] of this.avatars) {
            if (!avatarData.images) {
                avatarData.images = {};
                for (const [direction, frames] of Object.entries(avatarData.frames)) {
                    avatarData.images[direction] = frames.map(frameData => {
                        const img = new Image();
                        img.src = frameData;
                        return img;
                    });
                }
            }
        }
    }
    
    // NPC Management
    createNPCs() {
        if (!this.myPlayer) {
            console.log('Cannot create NPCs: no player position yet');
            return;
        }
        
        // Create some NPCs that will follow Crystal
        const npcData = [
            { id: 'npc1', name: 'Guardian', x: this.myPlayer.x - 50, y: this.myPlayer.y - 50, avatar: 'guardian', followDistance: 100 },
            { id: 'npc2', name: 'Companion', x: this.myPlayer.x + 50, y: this.myPlayer.y - 50, avatar: 'companion', followDistance: 150 },
            { id: 'npc3', name: 'Pet', x: this.myPlayer.x, y: this.myPlayer.y + 50, avatar: 'pet', followDistance: 80 }
        ];
        
        // Create simple avatar data for NPCs (using basic shapes for now)
        this.createNPCAvatars();
        
        for (const npc of npcData) {
            this.npcs.set(npc.id, {
                ...npc,
                facing: 'south',
                isMoving: false,
                animationFrame: 0,
                lastUpdate: Date.now()
            });
        }
        
        console.log('Created NPCs:', this.npcs.size, 'near player at', this.myPlayer.x, this.myPlayer.y);
    }
    
    createNPCAvatars() {
        // Create simple colored rectangles as NPC avatars
        const avatarTypes = ['guardian', 'companion', 'pet'];
        const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1'];
        
        for (let i = 0; i < avatarTypes.length; i++) {
            const avatarName = avatarTypes[i];
            const color = colors[i];
            
            // Create a simple colored square as avatar
            const canvas = document.createElement('canvas');
            canvas.width = 32;
            canvas.height = 32;
            const ctx = canvas.getContext('2d');
            
            // Draw colored square
            ctx.fillStyle = color;
            ctx.fillRect(4, 4, 24, 24);
            
            // Add border
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.strokeRect(4, 4, 24, 24);
            
            // Convert to data URL and create Image objects
            const dataURL = canvas.toDataURL();
            const img = new Image();
            img.src = dataURL;
            
            this.npcAvatars.set(avatarName, {
                name: avatarName,
                images: {
                    north: [img, img, img],
                    south: [img, img, img],
                    east: [img, img, img],
                    west: [img, img, img]
                }
            });
        }
        
        console.log('Created NPC avatars:', this.npcAvatars.size);
    }
    
    updateNPCs() {
        if (!this.myPlayer) {
            console.log('Cannot update NPCs: no player');
            return;
        }
        
        if (this.npcs.size === 0) {
            console.log('No NPCs to update');
            return;
        }
        
        const now = Date.now();
        const updateInterval = 100; // Update every 100ms
        
        for (const [npcId, npc] of this.npcs) {
            if (now - npc.lastUpdate < updateInterval) continue;
            
            // Calculate distance to player
            const dx = this.myPlayer.x - npc.x;
            const dy = this.myPlayer.y - npc.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // If NPC is too far, move towards player
            if (distance > npc.followDistance) {
                const moveSpeed = 2; // pixels per update
                const angle = Math.atan2(dy, dx);
                
                // Move towards player
                npc.x += Math.cos(angle) * moveSpeed;
                npc.y += Math.sin(angle) * moveSpeed;
                
                // Update facing direction
                if (Math.abs(dx) > Math.abs(dy)) {
                    npc.facing = dx > 0 ? 'east' : 'west';
                } else {
                    npc.facing = dy > 0 ? 'south' : 'north';
                }
                
                npc.isMoving = true;
                
                // Animate
                npc.animationFrame = (npc.animationFrame + 1) % 3;
            } else {
                npc.isMoving = false;
                npc.animationFrame = 0;
            }
            
            // Keep NPCs within world bounds
            npc.x = Math.max(0, Math.min(npc.x, this.worldWidth));
            npc.y = Math.max(0, Math.min(npc.y, this.worldHeight));
            
            npc.lastUpdate = now;
        }
    }
    
    // Viewport/camera methods
    updateViewport() {
        if (!this.myPlayer) return;
        
        // Center viewport on our player
        const centerX = this.myPlayer.x;
        const centerY = this.myPlayer.y;
        
        // Calculate viewport position (centered on player)
        let viewportX = centerX - this.viewport.width / 2;
        let viewportY = centerY - this.viewport.height / 2;
        
        // Clamp to world bounds
        viewportX = Math.max(0, Math.min(viewportX, this.worldWidth - this.viewport.width));
        viewportY = Math.max(0, Math.min(viewportY, this.worldHeight - this.viewport.height));
        
        this.viewport.x = viewportX;
        this.viewport.y = viewportY;
        
        // Debug logging
        console.log(`Viewport updated: player at (${centerX}, ${centerY}), viewport at (${viewportX}, ${viewportY})`);
    }
    
    // Coordinate conversion methods
    worldToScreen(worldX, worldY) {
        return {
            x: worldX - this.viewport.x,
            y: worldY - this.viewport.y
        };
    }
    
    screenToWorld(screenX, screenY) {
        return {
            x: screenX + this.viewport.x,
            y: screenY + this.viewport.y
        };
    }
    
    draw() {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        if (this.worldImage) {
            // Draw the world map with viewport offset
            this.ctx.drawImage(
                this.worldImage,
                this.viewport.x, this.viewport.y, // source x, y (viewport offset)
                this.viewport.width, this.viewport.height, // source width, height
                0, 0, // destination x, y (canvas origin)
                this.viewport.width, this.viewport.height // destination width, height
            );
        }
        
        // Draw all players
        this.drawPlayers();
        
        // Draw all NPCs
        this.drawNPCs();
        
        // Draw debug panel
        this.drawDebugPanel();
    }
    
    drawPlayers() {
        for (const [playerId, player] of this.players) {
            this.drawPlayer(player);
        }
    }
    
    drawPlayer(player) {
        const avatar = this.avatars.get(player.avatar);
        if (!avatar || !avatar.images) return;
        
        const screenPos = this.worldToScreen(player.x, player.y);
        
        // Check if player is visible in viewport
        if (screenPos.x < -50 || screenPos.x > this.viewport.width + 50 ||
            screenPos.y < -50 || screenPos.y > this.viewport.height + 50) {
            return;
        }
        
        // Get the appropriate avatar frame
        const direction = player.facing || 'south';
        const frameIndex = player.animationFrame || 0;
        const frames = avatar.images[direction];
        
        if (frames && frames[frameIndex]) {
            const img = frames[frameIndex];
            
            // Calculate avatar size (maintain aspect ratio)
            const avatarSize = 32; // Base size
            const aspectRatio = img.width / img.height;
            const width = avatarSize;
            const height = avatarSize / aspectRatio;
            
            // Center the avatar on the player position
            const x = screenPos.x - width / 2;
            const y = screenPos.y - height / 2;
            
            // Handle west direction (flip horizontally)
            if (direction === 'west') {
                this.ctx.save();
                this.ctx.scale(-1, 1);
                this.ctx.drawImage(img, -x - width, y, width, height);
                this.ctx.restore();
            } else {
                this.ctx.drawImage(img, x, y, width, height);
            }
        }
        
        // Draw username label
        this.drawPlayerLabel(player, screenPos);
    }
    
    drawPlayerLabel(player, screenPos) {
        this.ctx.save();
        this.ctx.fillStyle = 'white';
        this.ctx.strokeStyle = 'black';
        this.ctx.lineWidth = 2;
        this.ctx.font = '12px Arial';
        this.ctx.textAlign = 'center';
        
        const labelY = screenPos.y - 20;
        
        // Draw text with outline
        this.ctx.strokeText(player.username, screenPos.x, labelY);
        this.ctx.fillText(player.username, screenPos.x, labelY);
        
        this.ctx.restore();
    }
    
    drawNPCs() {
        if (this.npcs.size === 0) {
            console.log('No NPCs to draw');
            return;
        }
        
        console.log('Drawing', this.npcs.size, 'NPCs');
        for (const [npcId, npc] of this.npcs) {
            this.drawNPC(npc);
        }
    }
    
    drawNPC(npc) {
        const avatar = this.npcAvatars.get(npc.avatar);
        if (!avatar || !avatar.images) {
            console.log('No avatar for NPC:', npc.name, npc.avatar);
            return;
        }
        
        const screenPos = this.worldToScreen(npc.x, npc.y);
        console.log(`Drawing NPC ${npc.name} at world (${npc.x}, ${npc.y}) screen (${screenPos.x}, ${screenPos.y})`);
        
        // Check if NPC is visible in viewport
        if (screenPos.x < -50 || screenPos.x > this.viewport.width + 50 ||
            screenPos.y < -50 || screenPos.y > this.viewport.height + 50) {
            console.log(`NPC ${npc.name} outside viewport`);
            return;
        }
        
        // Get the appropriate avatar frame
        const direction = npc.facing || 'south';
        const frameIndex = npc.animationFrame || 0;
        const frames = avatar.images[direction];
        
        if (frames && frames[frameIndex]) {
            const img = frames[frameIndex];
            
            // Calculate avatar size (maintain aspect ratio)
            const avatarSize = 28; // Slightly smaller than players
            const aspectRatio = img.width / img.height;
            const width = avatarSize;
            const height = avatarSize / aspectRatio;
            
            // Center the avatar on the NPC position
            const x = screenPos.x - width / 2;
            const y = screenPos.y - height / 2;
            
            // Handle west direction (flip horizontally)
            if (direction === 'west') {
                this.ctx.save();
                this.ctx.scale(-1, 1);
                this.ctx.drawImage(img, -x - width, y, width, height);
                this.ctx.restore();
            } else {
                this.ctx.drawImage(img, x, y, width, height);
            }
        }
        
        // Draw NPC name label
        this.drawNPCLabel(npc, screenPos);
    }
    
    drawNPCLabel(npc, screenPos) {
        this.ctx.save();
        this.ctx.fillStyle = '#FFD700'; // Gold color for NPCs
        this.ctx.strokeStyle = 'black';
        this.ctx.lineWidth = 2;
        this.ctx.font = '10px Arial';
        this.ctx.textAlign = 'center';
        
        const labelY = screenPos.y - 25;
        
        // Draw text with outline
        this.ctx.strokeText(npc.name, screenPos.x, labelY);
        this.ctx.fillText(npc.name, screenPos.x, labelY);
        
        this.ctx.restore();
    }
    
    drawDebugPanel() {
        this.ctx.save();
        
        // Panel background
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        this.ctx.fillRect(10, 10, 300, 200);
        
        // Panel border
        this.ctx.strokeStyle = '#00FF00';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(10, 10, 300, 200);
        
        // Text styling
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.font = '12px monospace';
        this.ctx.textAlign = 'left';
        
        let y = 30;
        const lineHeight = 15;
        
        // Connection status
        const connectionStatus = this.ws && this.ws.readyState === WebSocket.OPEN ? 'CONNECTED' : 'DISCONNECTED';
        const connectionColor = this.ws && this.ws.readyState === WebSocket.OPEN ? '#00FF00' : '#FF0000';
        
        this.ctx.fillStyle = connectionColor;
        this.ctx.fillText(`WebSocket: ${connectionStatus}`, 20, y);
        y += lineHeight;
        
        // Player info
        this.ctx.fillStyle = '#FFFFFF';
        if (this.myPlayer) {
            this.ctx.fillText(`Player: ${this.myPlayer.username}`, 20, y);
            y += lineHeight;
            this.ctx.fillText(`Position: (${Math.floor(this.myPlayer.x)}, ${Math.floor(this.myPlayer.y)})`, 20, y);
            y += lineHeight;
        } else {
            this.ctx.fillText('Player: Not connected', 20, y);
            y += lineHeight;
        }
        
        // Viewport info
        this.ctx.fillText(`Viewport: (${Math.floor(this.viewport.x)}, ${Math.floor(this.viewport.y)})`, 20, y);
        y += lineHeight;
        this.ctx.fillText(`Size: ${this.viewport.width}x${this.viewport.height}`, 20, y);
        y += lineHeight;
        
        // NPC count
        this.ctx.fillText(`NPCs: ${this.npcs.size}`, 20, y);
        y += lineHeight;
        
        // NPC details
        if (this.npcs.size > 0) {
            this.ctx.fillText('NPC Positions:', 20, y);
            y += lineHeight;
            
            for (const [npcId, npc] of this.npcs) {
                const screenPos = this.worldToScreen(npc.x, npc.y);
                const isVisible = screenPos.x >= -50 && screenPos.x <= this.viewport.width + 50 && 
                                 screenPos.y >= -50 && screenPos.y <= this.viewport.height + 50;
                
                const status = isVisible ? 'VISIBLE' : 'OFF-SCREEN';
                const color = isVisible ? '#00FF00' : '#FFAA00';
                
                this.ctx.fillStyle = color;
                this.ctx.fillText(`  ${npc.name}: (${Math.floor(npc.x)}, ${Math.floor(npc.y)}) [${status}]`, 20, y);
                y += lineHeight;
                
                if (y > 180) break; // Don't overflow the panel
            }
        } else {
            this.ctx.fillText('No NPCs created', 20, y);
        }
        
        this.ctx.restore();
    }
    
    setupEventListeners() {
        // Add click event for future click-to-move functionality
        this.canvas.addEventListener('click', (event) => {
            const rect = this.canvas.getBoundingClientRect();
            const screenX = event.clientX - rect.left;
            const screenY = event.clientY - rect.top;
            
            // Convert screen coordinates to world coordinates
            const worldPos = this.screenToWorld(screenX, screenY);
            
            console.log(`Clicked at world coordinates: (${Math.floor(worldPos.x)}, ${Math.floor(worldPos.y)})`);
        });
        
        // Add keyboard event listeners for movement
        document.addEventListener('keydown', (event) => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
            
            let direction = null;
            switch(event.key) {
                case 'ArrowUp':
                case 'w':
                case 'W':
                    direction = 'up';
                    break;
                case 'ArrowDown':
                case 's':
                case 'S':
                    direction = 'down';
                    break;
                case 'ArrowLeft':
                case 'a':
                case 'A':
                    direction = 'left';
                    break;
                case 'ArrowRight':
                case 'd':
                case 'D':
                    direction = 'right';
                    break;
            }
            
            if (direction) {
                this.sendMoveCommand(direction);
            }
        });
        
        // Stop movement when key is released
        document.addEventListener('keyup', (event) => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
            
            const stopKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'W', 's', 'S', 'a', 'A', 'd', 'D'];
            if (stopKeys.includes(event.key)) {
                this.sendStopCommand();
            }
        });
    }
    
    sendMoveCommand(direction) {
        const moveMessage = {
            action: 'move',
            direction: direction
        };
        
        this.ws.send(JSON.stringify(moveMessage));
    }
    
    sendStopCommand() {
        const stopMessage = {
            action: 'stop'
        };
        
        this.ws.send(JSON.stringify(stopMessage));
    }
    
    // Game loop for NPCs and animations
    startGameLoop() {
        const gameLoop = () => {
            // Update NPCs
            this.updateNPCs();
            
            // Redraw if there are changes
            this.draw();
            
            // Continue the loop
            requestAnimationFrame(gameLoop);
        };
        
        // Start the game loop
        requestAnimationFrame(gameLoop);
    }
}

// Initialize the game when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new GameClient();
});
