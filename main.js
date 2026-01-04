import Matter from 'matter-js';

const { Engine, Render, Runner, World, Bodies, Events, Body, Composite } = Matter;

// Canvas setup
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 800;
const WALL_THICKNESS = 20;
const BIN_LEFT = 100;
const BIN_RIGHT = 500;
const BIN_FLOOR = 750;
const DANGER_LINE_Y = 150;
const PREVIEW_Y = 80;

canvas.width = CANVAS_WIDTH;
canvas.height = CANVAS_HEIGHT;

// Physics engine
const engine = Engine.create();
engine.world.gravity.y = 0.8;
const runner = Runner.create();

// Game state
let score = 0;
let isPaused = false;
let isGameOver = false;
let nextFruitLevel = 0;
let mouseX = CANVAS_WIDTH / 2;
let dangerZoneFruits = new Set();
let dangerZoneStartTime = null;
let walls = [];

// Fruit configuration
const FRUIT_LEVELS = [
  { level: 0, radius: 20, color: '#FF6B9D', label: '1' },
  { level: 1, radius: 28, color: '#C44569', label: '2' },
  { level: 2, radius: 36, color: '#F8B500', label: '3' },
  { level: 3, radius: 44, color: '#FF9500', label: '4' },
  { level: 4, radius: 52, color: '#FF6B35', label: '5' },
  { level: 5, radius: 60, color: '#4ECDC4', label: '6' },
  { level: 6, radius: 68, color: '#45B7D1', label: '7' },
  { level: 7, radius: 76, color: '#96CEB4', label: '8' },
  { level: 8, radius: 84, color: '#FFEAA7', label: '9' },
  { level: 9, radius: 92, color: '#DDA15E', label: '10' },
  { level: 10, radius: 100, color: '#BC6C25', label: '🍉' },
];

// UI elements
const scoreElement = document.getElementById('score');
const pauseBtn = document.getElementById('pause-btn');
const restartBtn = document.getElementById('restart-btn');
const gameOverOverlay = document.getElementById('game-over-overlay');
const finalScoreElement = document.getElementById('final-score');
const restartOverlayBtn = document.getElementById('restart-overlay-btn');

// Helper functions
function getRandomSmallFruitLevel() {
  const maxLevel = Math.min(3, FRUIT_LEVELS.length - 1);
  return Math.floor(Math.random() * (maxLevel + 1));
}

function createFruit(x, y, level) {
  const config = FRUIT_LEVELS[level];
  const fruit = Bodies.circle(x, y, config.radius, {
    restitution: 0.4,
    friction: 0.3,
    density: 0.001,
  });
  fruit.fruitLevel = level;
  fruit.isMerging = false;
  fruit.timeCreated = Date.now();
  return fruit;
}

function createWalls() {
  const floor = Bodies.rectangle(
    CANVAS_WIDTH / 2,
    BIN_FLOOR + WALL_THICKNESS / 2,
    BIN_RIGHT - BIN_LEFT,
    WALL_THICKNESS,
    { isStatic: true }
  );

  const leftWall = Bodies.rectangle(
    BIN_LEFT - WALL_THICKNESS / 2,
    (DANGER_LINE_Y + BIN_FLOOR) / 2,
    WALL_THICKNESS,
    BIN_FLOOR - DANGER_LINE_Y + WALL_THICKNESS,
    { isStatic: true }
  );

  const rightWall = Bodies.rectangle(
    BIN_RIGHT + WALL_THICKNESS / 2,
    (DANGER_LINE_Y + BIN_FLOOR) / 2,
    WALL_THICKNESS,
    BIN_FLOOR - DANGER_LINE_Y + WALL_THICKNESS,
    { isStatic: true }
  );

  walls = [floor, leftWall, rightWall];
  World.add(engine.world, walls);
  return walls;
}

function drawFruit(x, y, radius, color, label) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
  ctx.lineWidth = 2;
  ctx.stroke();
  
  ctx.fillStyle = 'white';
  ctx.font = `bold ${radius * 0.5}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x, y);
}

function drawBin() {
  ctx.fillStyle = '#34495e';
  
  walls.forEach(wall => {
    const width = wall.bounds.max.x - wall.bounds.min.x;
    const height = wall.bounds.max.y - wall.bounds.min.y;
    ctx.fillRect(
      wall.bounds.min.x,
      wall.bounds.min.y,
      width,
      height
    );
  });
}

function drawDangerLine() {
  ctx.strokeStyle = '#e74c3c';
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 5]);
  ctx.beginPath();
  ctx.moveTo(BIN_LEFT, DANGER_LINE_Y);
  ctx.lineTo(BIN_RIGHT, DANGER_LINE_Y);
  ctx.stroke();
  ctx.setLineDash([]);
}

function checkDangerZone() {
  const bodies = Composite.allBodies(engine.world);
  const fruitsInDangerZone = new Set();
  
  bodies.forEach(body => {
    if (body.fruitLevel !== undefined && !body.isMerging) {
      const radius = FRUIT_LEVELS[body.fruitLevel].radius;
      if (body.position.y - radius <= DANGER_LINE_Y) {
        fruitsInDangerZone.add(body.id);
      }
    }
  });
  
  if (fruitsInDangerZone.size > 0) {
    const allSame = fruitsInDangerZone.size === dangerZoneFruits.size &&
                    [...fruitsInDangerZone].every(id => dangerZoneFruits.has(id));
    
    if (allSame) {
      if (dangerZoneStartTime === null) {
        dangerZoneStartTime = Date.now();
      } else if (Date.now() - dangerZoneStartTime > 1000) {
        triggerGameOver();
      }
    } else {
      dangerZoneFruits = fruitsInDangerZone;
      dangerZoneStartTime = Date.now();
    }
  } else {
    dangerZoneFruits.clear();
    dangerZoneStartTime = null;
  }
}

function triggerGameOver() {
  if (isGameOver) return;
  isGameOver = true;
  Runner.stop(runner);
  gameOverOverlay.classList.remove('hidden');
  finalScoreElement.textContent = score;
}

const mergingBodies = new Set();

function mergeFruits(fruit1, fruit2) {
  if (fruit1.isMerging || fruit2.isMerging || 
      fruit1.fruitLevel !== fruit2.fruitLevel ||
      mergingBodies.has(fruit1.id) || mergingBodies.has(fruit2.id)) {
    return;
  }
  
  const level = fruit1.fruitLevel;
  if (level >= FRUIT_LEVELS.length - 1) {
    return;
  }
  
  fruit1.isMerging = true;
  fruit2.isMerging = true;
  mergingBodies.add(fruit1.id);
  mergingBodies.add(fruit2.id);
  
  const mergeX = (fruit1.position.x + fruit2.position.x) / 2;
  const mergeY = (fruit1.position.y + fruit2.position.y) / 2;
  
  World.remove(engine.world, fruit1);
  World.remove(engine.world, fruit2);
  
  setTimeout(() => {
    const newLevel = level + 1;
    const newFruit = createFruit(mergeX, mergeY, newLevel);
    World.add(engine.world, newFruit);
    
    const points = Math.pow(2, newLevel);
    score += points;
    scoreElement.textContent = score;
    
    mergingBodies.delete(fruit1.id);
    mergingBodies.delete(fruit2.id);
  }, 50);
}

function handleCollision(event) {
  if (isGameOver || isPaused) return;
  
  const pairs = event.pairs;
  pairs.forEach(pair => {
    const { bodyA, bodyB } = pair;
    if (bodyA.fruitLevel !== undefined && bodyB.fruitLevel !== undefined) {
      if (bodyA.fruitLevel === bodyB.fruitLevel) {
        mergeFruits(bodyA, bodyB);
      }
    }
  });
}

function dropFruit() {
  if (isGameOver || isPaused) return;
  
  const clampedX = Math.max(BIN_LEFT + FRUIT_LEVELS[nextFruitLevel].radius, 
                            Math.min(BIN_RIGHT - FRUIT_LEVELS[nextFruitLevel].radius, mouseX));
  const fruit = createFruit(clampedX, PREVIEW_Y, nextFruitLevel);
  World.add(engine.world, fruit);
  
  nextFruitLevel = getRandomSmallFruitLevel();
}

function resetGame() {
  isGameOver = false;
  isPaused = false;
  score = 0;
  scoreElement.textContent = score;
  gameOverOverlay.classList.add('hidden');
  dangerZoneStartTime = null;
  dangerZoneFruits.clear();
  mergingBodies.clear();
  pauseBtn.textContent = 'Pause';
  
  const bodies = Composite.allBodies(engine.world);
  bodies.forEach(body => {
    if (body.fruitLevel !== undefined) {
      World.remove(engine.world, body);
    }
  });
  
  walls.forEach(wall => {
    World.remove(engine.world, wall);
  });
  
  Runner.stop(runner);
  Engine.clear(engine);
  engine.world.gravity.y = 0.8;
  
  createWalls();
  nextFruitLevel = getRandomSmallFruitLevel();
  Runner.run(runner, engine);
}

// Event listeners
Events.on(engine, 'collisionStart', handleCollision);

canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  mouseX = e.clientX - rect.left;
});

canvas.addEventListener('click', () => {
  if (!isPaused && !isGameOver) {
    dropFruit();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !isPaused && !isGameOver) {
    e.preventDefault();
    dropFruit();
  }
});

pauseBtn.addEventListener('click', () => {
  if (isGameOver) return;
  isPaused = !isPaused;
  if (isPaused) {
    Runner.stop(runner);
    pauseBtn.textContent = 'Resume';
  } else {
    Runner.run(runner, engine);
    pauseBtn.textContent = 'Pause';
  }
});

restartBtn.addEventListener('click', resetGame);
restartOverlayBtn.addEventListener('click', resetGame);

// Render loop
function render() {
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  
  drawBin();
  drawDangerLine();
  
  const bodies = Composite.allBodies(engine.world);
  bodies.forEach(body => {
    if (body.fruitLevel !== undefined) {
      const config = FRUIT_LEVELS[body.fruitLevel];
      drawFruit(body.position.x, body.position.y, config.radius, config.color, config.label);
    }
  });
  
  if (!isPaused && !isGameOver) {
    const config = FRUIT_LEVELS[nextFruitLevel];
    const clampedX = Math.max(BIN_LEFT + config.radius, 
                              Math.min(BIN_RIGHT - config.radius, mouseX));
    drawFruit(clampedX, PREVIEW_Y, config.radius, config.color, config.label);
  }
  
  if (!isPaused && !isGameOver) {
    checkDangerZone();
  }
  
  requestAnimationFrame(render);
}

// Initialize
createWalls();
nextFruitLevel = getRandomSmallFruitLevel();
Runner.run(runner, engine);
render();
