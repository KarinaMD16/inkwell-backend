import type { Block, Role } from '../schema.js';

/**
 * Datos de ejemplo con forma de uso real: personas de distintas edades, historias de varios
 * géneros y clasificaciones, capítulos con plantillas, votos y repisas. Todo el texto es original.
 * Las fechas son relativas a hoy (días atrás), así "recientes" y "populares" tienen sentido.
 */

export interface SeedPerson {
  handle: string;
  name: string;
  bio: string;
  /** Edad al día de hoy: la fecha de nacimiento se calcula al sembrar. */
  age: number;
  role?: Role;
  showMature?: boolean;
}

export interface SeedChapter {
  title: string;
  badge?: string;
  /** Días atrás en que se publicó. null = borrador; negativo = programado para el futuro. */
  daysAgo: number | null;
  content: Block[];
}

export interface SeedStory {
  author: string;
  title: string;
  tagline: string;
  synopsis: string;
  kind: 'Original' | 'Fanfic' | 'Poesía' | 'No ficción';
  genre: string;
  subgenres?: string[];
  fandom?: string;
  relation?: string;
  characters?: string[];
  tropes?: string[];
  warnings?: string[];
  tags?: string[];
  rating: 'Todo público' | '+13' | '+16' | '+18';
  status: 'En curso' | 'En pausa' | 'Completa';
  format?: 'Narrativa' | 'Redes sociales' | 'Con fichas';
  color: string;
  ink: string;
  art: 'wave' | 'chat' | 'moon' | 'sun' | 'dots' | 'stripes';
  published?: boolean;
  reads: number;
  chapters: SeedChapter[];
}

/** Votos (por capítulo publicado, contando desde 1) y lo que cada persona tiene en su repisa. */
export interface SeedReading {
  reader: string;
  story: string;
  /** Capítulo por el que va. */
  at: number;
  /** Capítulos que votó y hace cuántos días. */
  votes?: [chapter: number, daysAgo: number][];
}

const ink = '#14152B';
const paper = '#FFFBF8';
const p = (text: string): Block => ({ type: 'p', text });

export const PEOPLE: SeedPerson[] = [
  { handle: 'tinta.lunar', name: 'Luna Ferrer', age: 24, showMature: true, bio: 'Escribo romance lento y fantasía con faros. Publico los domingos.' },
  { handle: 'marisol.fics', name: 'Marisol', age: 19, bio: 'Fanfics de Genshin y Haikyuu. Si hay rivales, me apunto.' },
  { handle: 'leo.escribe', name: 'Leo Duarte', age: 17, bio: 'Ciencia ficción, misterios con abuelas y demasiado café.' },
  { handle: 'sofi.noches', name: 'Sofía Rivas', age: 28, showMature: true, bio: 'Terror doméstico y dramas familiares. Lee con la luz prendida.' },
  { handle: 'ramiro.verso', name: 'Ramiro Paz', age: 31, bio: 'Poemas cortos y notas para sobrevivir a la universidad.' },
  { handle: 'caro.lee', name: 'Carolina', age: 15, bio: 'Leo de todo menos terror. Bueno, a veces terror.' },
  { handle: 'dani.paginas', name: 'Dani', age: 16, bio: 'Mi repisa está más llena que mi agenda.' },
  { handle: 'vale.modera', name: 'Valeria Soto', age: 26, role: 'moderador', showMature: true, bio: 'Moderación de Inkwell. Si algo no está bien, avísanos.' },
];

export const STORIES: SeedStory[] = [
  {
    author: 'tinta.lunar', title: 'El faro de las horas perdidas', tagline: 'Cada noche el faro devuelve una hora que alguien perdió.',
    synopsis: 'Mara hereda un faro que no ilumina barcos sino recuerdos. Cuando empieza a recibir horas que no son suyas, entiende que alguien en el pueblo está olvidando a propósito.',
    kind: 'Original', genre: 'Fantasía', subgenres: ['Misterio'], characters: ['Mara', 'Elio'], tropes: ['Found family', 'Slow burn'],
    tags: ['Pueblo costero'], rating: '+13', status: 'En curso', color: '#0F8B80', ink: paper, art: 'moon', reads: 1840,
    chapters: [
      { title: 'La herencia', daysAgo: 41, content: [
        p('El notario le entregó la llave envuelta en un pañuelo azul, como si fuera algo que pudiera romperse. Mara pensó que exageraba hasta que la tocó y sintió el frío de una mañana que no era suya.'),
        p('El faro estaba al final del muelle, con la pintura pelada y la puerta hinchada por la sal. Adentro olía a aceite viejo y a pan recién hecho, aunque nadie había cocinado ahí en años.'),
        p('Esa noche, cuando encendió la lámpara por primera vez, la luz no salió hacia el mar. Se quedó girando dentro de la torre y le dejó en las manos una hora entera: la de una niña que esperaba a su padre en la estación.'),
      ] },
      { title: 'Horas ajenas', daysAgo: 27, content: [
        p('Elio llegó al tercer día, con una caja de herramientas y la excusa de revisar las ventanas. No preguntó por la luz que giraba al revés. Preguntó si ella también escuchaba los relojes.'),
        p('Mara le mostró el cuaderno donde anotaba cada hora recibida: una boda, una despedida, una tarde de lluvia en una cocina. Todas eran del mismo pueblo y todas habían sido olvidadas el mismo martes.'),
      ] },
      { title: 'El martes que nadie recuerda', daysAgo: 6, content: [
        p('En el mercado nadie supo decirle qué había pasado ese martes. La panadera se rió, el cartero cambió de tema y la maestra se quedó mirando un punto fijo, como si alguien le hubiera borrado la pregunta.'),
        p('Esa noche el faro le devolvió la hora más larga de todas, y por primera vez reconoció una voz: era la suya.'),
      ] },
    ],
  },
  {
    author: 'tinta.lunar', title: 'Cartas al chico del 4B', tagline: 'Empezó como una queja por el ruido. Terminó siendo otra cosa.',
    synopsis: 'Abril vive en el 4A y odia al músico del 4B. Le deja notas en la puerta; él contesta por el grupo del edificio. Una historia contada en mensajes.',
    kind: 'Original', genre: 'Romance', subgenres: ['Humor'], relation: 'Abril / Tomás', characters: ['Abril', 'Tomás'],
    tropes: ['Enemies to lovers', 'Vecinos'], warnings: ['Lenguaje fuerte'], rating: '+16', status: 'Completa', format: 'Redes sociales',
    color: '#FF8FAB', ink, art: 'chat', reads: 3120,
    chapters: [
      { title: 'Grupo: Edificio Las Acacias', badge: 'Chat', daysAgo: 58, content: [
        { type: 'chat', title: 'Edificio Las Acacias', messages: [
          { who: 'Abril (4A)', text: '¿Alguien más escucha una batería a las dos de la mañana o soy yo?', me: true },
          { who: 'Doña Inés (2B)', text: 'Yo no escucho nada, mija, me quito los audífonos para dormir.' },
          { who: 'Tomás (4B)', text: 'Es un cajón peruano. No es una batería.' },
          { who: 'Abril (4A)', text: 'Me da igual el nombre del instrumento.', me: true },
        ] },
        p('Esa noche Abril pegó una nota en la puerta del 4B: «Los vecinos también tenemos ritmo cardíaco. Respétalo».'),
      ] },
      { title: 'La nota de respuesta', badge: 'Chat', daysAgo: 44, content: [
        p('A la mañana siguiente había una nota en su puerta, con letra apurada: «Ensayo para una audición. Si me va bien, me mudo y te libras de mí».'),
        { type: 'chat', title: 'Tomás (4B)', messages: [
          { who: 'Abril', text: '¿A qué hora es la audición?', me: true },
          { who: 'Tomás', text: 'El viernes a las diez. ¿Por qué?' },
          { who: 'Abril', text: 'Para saber hasta cuándo aguantar.', me: true },
          { who: 'Tomás', text: 'Mentira. Quieres ir.' },
        ] },
      ] },
      { title: 'Viernes, diez de la mañana', daysAgo: 30, content: [
        p('Abril llegó tarde a propósito, para que no pareciera que había ido por él. Se sentó en la última fila del teatro con el abrigo puesto y las manos frías.'),
        p('Cuando Tomás terminó, no aplaudió. Le mandó un mensaje: «Puedes quedarte en el edificio. Ya me acostumbré al ruido».'),
      ] },
    ],
  },
  {
    author: 'tinta.lunar', title: 'Lo que queda de la noche', tagline: 'Dos personas que se dejaron hace diez años coinciden en la misma boda.',
    synopsis: 'Irene y Gael se reencuentran en la boda de una amiga en común. Una noche para decirse lo que no se dijeron, y decidir si vale la pena intentarlo otra vez.',
    kind: 'Original', genre: 'Romance', subgenres: ['Drama'], relation: 'Irene / Gael', characters: ['Irene', 'Gael'],
    tropes: ['Segundas oportunidades'], warnings: ['Contenido sexual'], rating: '+18', status: 'En curso',
    color: '#4B3B8F', ink: paper, art: 'stripes', reads: 960,
    chapters: [
      { title: 'Mesa doce', daysAgo: 15, content: [
        p('La tarjeta decía «Mesa doce» y el nombre de él estaba justo al lado del suyo. Irene pensó en cambiarse de silla, pero la novia la estaba mirando con una sonrisa que pedía, por favor, no hacer una escena.'),
        p('Gael llegó tarde, como siempre. Se disculpó con todos menos con ella, y eso dolió más de lo que Irene estaba dispuesta a admitir.'),
      ] },
      { title: 'Después del brindis', daysAgo: 3, content: [
        p('Salieron al jardín cuando empezó la música lenta. Hablaron de trabajos, de ciudades, de nada. Hasta que él dijo su nombre como lo decía antes, y la noche cambió de temperatura.'),
        p('Lo que pasó después lo recordarían de maneras distintas, pero los dos coincidían en una cosa: ninguno se fue a dormir pensando que era un error.'),
      ] },
    ],
  },
  {
    author: 'marisol.fics', title: 'La última partida en Inazuma', tagline: 'Un detective, un poeta errante y una partida de shogi que nadie quiere perder.',
    synopsis: 'Heizou desafía a Kazuha a una partida para resolver un caso. Lo que empieza como un juego de lógica termina siendo una conversación que ninguno esperaba.',
    kind: 'Fanfic', fandom: 'Genshin Impact', genre: 'Romance', subgenres: ['Misterio'], relation: 'Kazuha / Heizou',
    characters: ['Kaedehara Kazuha', 'Shikanoin Heizou'], tropes: ['Rivals to lovers'], rating: '+13', status: 'En curso',
    color: '#DD5D4F', ink: paper, art: 'wave', reads: 2450,
    chapters: [
      { title: 'Apertura', daysAgo: 20, content: [
        p('Heizou dejó el tablero sobre la mesa de la casa de té con un golpe seco, como quien pone una prueba frente a un sospechoso. Kazuha no levantó la vista de su taza.'),
        p('—Si gano, me cuentas qué viste en el puerto —dijo Heizou.'),
        p('—Y si gano yo, me dejas en paz el resto de la temporada —respondió Kazuha, moviendo la primera pieza sin mirar el tablero.'),
      ] },
      { title: 'Jaque al poeta', daysAgo: 9, content: [
        p('Pasaron tres horas. Afuera empezó a llover y ninguno de los dos se movió. Heizou descubrió que Kazuha jugaba como escribía: dejando espacios que parecían errores y no lo eran.'),
        p('Cuando por fin ganó, Heizou no preguntó por el puerto. Preguntó si podían jugar otra vez mañana.'),
      ] },
    ],
  },
  {
    author: 'marisol.fics', title: 'AU: Cafetería Teyvat', tagline: 'Todos trabajan en la misma cafetería. Nadie sabe hacer un capuchino.',
    synopsis: 'Un AU de oficina, pero en una cafetería. Contado en el grupo de trabajo, con turnos imposibles, clientes raros y una máquina de espresso con personalidad.',
    kind: 'Fanfic', fandom: 'Genshin Impact', genre: 'Humor', subgenres: ['Amistad'], characters: ['Lumine', 'Paimon', 'Zhongli'],
    tropes: ['Coffee shop AU', 'Found family'], rating: 'Todo público', status: 'En curso', format: 'Redes sociales',
    color: '#F6C453', ink, art: 'chat', reads: 1290,
    chapters: [
      { title: 'Turno de mañana', badge: 'Chat', daysAgo: 12, content: [
        { type: 'chat', title: 'Cafetería Teyvat · Equipo', messages: [
          { who: 'Lumine', text: '¿Quién dejó la máquina de espresso haciendo ese ruido?' },
          { who: 'Paimon', text: 'Paimon solo la miró. No la tocó. Bueno, un poquito.' },
          { who: 'Zhongli', text: 'Le pedí que preparara un té. Debí suponer que no era su especialidad.' },
          { who: 'Lumine', text: 'Abrimos en diez minutos.', me: false },
        ] },
      ] },
      { title: 'Cliente frecuente', badge: 'Chat', daysAgo: 2, content: [
        { type: 'post', author: '@cafeteriateyvat', text: 'Hoy el café del día es «el que salga». Gracias por su comprensión.' },
        p('Zhongli tardó veinte minutos en cobrar un pan porque le contó al cliente la historia del trigo. El cliente volvió al día siguiente con un amigo.'),
      ] },
    ],
  },
  {
    author: 'marisol.fics', title: 'Saque de práctica', tagline: 'Un saque fallado, una apuesta y un verano entero de entrenamientos.',
    synopsis: 'Después de perder un partido de práctica, Hinata y Kageyama apuestan quién mejora más antes del torneo. Ninguno contaba con tener que entrenar juntos todas las tardes.',
    kind: 'Fanfic', fandom: 'Haikyuu!!', genre: 'Deportes', subgenres: ['Humor', 'Amistad'], relation: 'Kageyama / Hinata',
    characters: ['Hinata Shoyo', 'Kageyama Tobio'], tropes: ['Rivales', 'Slow burn'], rating: '+13', status: 'En curso',
    color: '#F28C38', ink, art: 'sun', reads: 1730,
    chapters: [
      { title: 'La apuesta', daysAgo: 33, content: [
        p('El balón rebotó en la red por tercera vez y Kageyama soltó un suspiro tan largo que el entrenador se dio vuelta a mirar.'),
        p('—El que mejore más su saque antes del torneo invita la comida todo el mes —dijo Hinata.'),
        p('—Vas a quedarte sin dinero —respondió Kageyama, y le tendió la mano.'),
      ] },
      { title: 'Seis de la tarde', daysAgo: 18, content: [
        p('Entrenaban cuando el gimnasio ya estaba vacío y la luz del atardecer entraba de lado. Hinata contaba los saques en voz alta; Kageyama corregía cada número.'),
      ] },
      { title: 'El torneo', daysAgo: -5, content: [
        p('Capítulo programado: el día del torneo llega la próxima semana.'),
      ] },
    ],
  },
  {
    author: 'marisol.fics', title: 'Notas para un AU de sirenas', tagline: 'Ideas sueltas que todavía no son historia.', synopsis: 'Borrador.',
    kind: 'Fanfic', fandom: 'Genshin Impact', genre: 'Fantasía', rating: '+13', status: 'En pausa', published: false,
    color: '#D7F0EC', ink, art: 'wave', reads: 0,
    chapters: [{ title: 'Ideas', daysAgo: null, content: [p('Sirenas en el puerto de Liyue. ¿Quién es el pescador?')] }],
  },
  {
    author: 'leo.escribe', title: 'Protocolo Ganímedes', tagline: 'La estación lleva tres días sin responder. Mandan a los más jóvenes.',
    synopsis: 'Cuatro cadetes viajan a una estación minera en Ganímedes que dejó de comunicarse. Lo que encuentran no es un accidente: es una invitación.',
    kind: 'Original', genre: 'Ciencia ficción', subgenres: ['Aventura'], characters: ['Nadia', 'Bruno', 'Ixchel', 'Teo'],
    tropes: ['Found family'], warnings: ['Violencia'], rating: '+13', status: 'En curso', format: 'Con fichas',
    color: '#1F3A5F', ink: paper, art: 'dots', reads: 880,
    chapters: [
      { title: 'La tripulación', badge: 'Fichas', daysAgo: 24, content: [
        { type: 'ficha', name: 'Nadia Ortega', tags: ['Piloto', '19 años'], text: 'Aprendió a volar antes que a manejar. No confía en las máquinas que no puede abrir.' },
        { type: 'ficha', name: 'Bruno Kalu', tags: ['Ingeniero', '18 años'], text: 'Habla con los motores. A veces le contestan.' },
        { type: 'ficha', name: 'Ixchel Ramos', tags: ['Médica', '20 años'], text: 'La única que leyó el manual completo. Lo cita cuando está nerviosa.' },
        { type: 'ficha', name: 'Teo Lima', tags: ['Comunicaciones', '17 años'], text: 'Escucha frecuencias que nadie más oye.' },
      ] },
      { title: 'Señal muerta', daysAgo: 11, content: [
        p('Ganímedes apareció en la ventana como una moneda sucia. Teo llevaba seis horas con los audífonos puestos y no había escuchado nada, hasta que escuchó algo.'),
        p('—Es un patrón —dijo—. Tres pulsos cortos, uno largo. Se repite cada once minutos.'),
        { type: 'interludio', text: 'Registro de la estación, día 1: los mineros reportan sueños compartidos.' },
      ] },
      { title: 'Atraque', daysAgo: null, content: [p('Borrador del atraque.')] },
    ],
  },
  {
    author: 'leo.escribe', title: 'Mi abuela tiene un club de detectives', tagline: 'Cinco señoras, un gato desaparecido y cero paciencia.',
    synopsis: 'Cuando desaparece el gato del vecino, la abuela de Iván reúne a su club de tejido para investigar. Iván solo quería pasar el verano jugando videojuegos.',
    kind: 'Original', genre: 'Humor', subgenres: ['Misterio'], characters: ['Iván', 'Abuela Rosa'], tropes: ['Detectives aficionados'],
    rating: 'Todo público', status: 'Completa', color: '#FFD9A8', ink, art: 'sun', reads: 2210,
    chapters: [
      { title: 'El caso del gato Miguelito', daysAgo: 50, content: [
        p('La abuela Rosa puso un pizarrón en la sala y escribió con tiza: «SOSPECHOSOS». Debajo había una sola palabra: «Todos».'),
        p('Iván intentó explicarle que los gatos a veces se van solos. La abuela lo miró por encima de los lentes y le pasó una libreta. Ahora era el secretario del club.'),
      ] },
      { title: 'Caso cerrado', daysAgo: 36, content: [
        p('Miguelito estaba en el techo de la panadería, gordo y feliz, comiendo los restos de pan dulce que le dejaba la panadera desde hacía semanas.'),
        p('El club celebró con chocolate caliente. Iván, sin querer, ya estaba pensando en el próximo caso.'),
      ] },
    ],
  },
  {
    author: 'sofi.noches', title: 'La casa de la calle Ciprés', tagline: 'La casa estaba barata por una razón. Nadie se la dijo.',
    synopsis: 'Una familia se muda a una casa antigua en las afueras. Las puertas se cierran solas, el perro no entra al sótano y la hija menor tiene una amiga nueva que nadie ve.',
    kind: 'Original', genre: 'Terror', subgenres: ['Paranormal'], characters: ['Clara', 'Lucía'], tropes: ['Casa embrujada'],
    warnings: ['Violencia', 'Muerte de personaje'], rating: '+16', status: 'Completa', color: '#14152B', ink: paper, art: 'moon', reads: 4020,
    chapters: [
      { title: 'Mudanza', daysAgo: 70, content: [
        p('El perro se negó a bajar del auto. Clara lo cargó hasta la puerta y sintió cómo temblaba contra su pecho.'),
        p('La casa olía a madera mojada y a algo dulce, como flores dejadas demasiado tiempo en un florero.'),
      ] },
      { title: 'La amiga de Lucía', daysAgo: 55, content: [
        p('—Se llama Elena —dijo Lucía, señalando una silla vacía—. Dice que vivía aquí antes.'),
        p('Clara sonrió como sonríen los adultos cuando no quieren asustar a nadie. Esa noche puso una silla contra la puerta de su cuarto.'),
      ] },
      { title: 'El sótano', daysAgo: 40, content: [
        p('Bajó con una linterna y el corazón en la garganta. En la pared del fondo había marcas de estatura, como las que hacen los padres en las puertas. La última tenía escrito un nombre: Elena.'),
        p('Debajo, con letra infantil y reciente, alguien había agregado otra: Lucía.'),
      ] },
    ],
  },
  {
    author: 'sofi.noches', title: 'Lo que no se dice en la cena', tagline: 'Una familia, una mesa y un secreto que todos saben menos uno.',
    synopsis: 'Cada domingo los Vidal cenan juntos. Este domingo Paula decide decir en voz alta lo que su familia lleva años callando.',
    kind: 'Original', genre: 'Drama', characters: ['Paula', 'Marta'], tropes: ['Secretos familiares'], warnings: ['Salud mental'],
    rating: '+16', status: 'En pausa', color: '#B9A5F0', ink, art: 'stripes', reads: 640,
    chapters: [
      { title: 'Domingo', daysAgo: 62, content: [
        p('La sopa estaba demasiado caliente y nadie hablaba. Paula contó los cubiertos para no contar los silencios.'),
        p('Su madre le preguntó por el trabajo. Paula dijo que bien, y las dos supieron que era mentira.'),
      ] },
      { title: 'Postre', daysAgo: 48, content: [
        p('Fue en el postre, cuando su hermana se levantó a buscar más azúcar, que Paula dejó la cuchara sobre el plato y dijo: «Necesito que hablemos de papá».'),
      ] },
    ],
  },
  {
    author: 'ramiro.verso', title: 'Inventario de un invierno', tagline: 'Poemas cortos para leer con algo caliente entre las manos.',
    synopsis: 'Una colección de poemas sobre la ciudad en invierno, las ventanas empañadas y las cosas pequeñas que sostienen un día.',
    kind: 'Poesía', genre: 'Drama', tags: ['Invierno', 'Ciudad'], rating: 'Todo público', status: 'Completa',
    color: '#D7F0EC', ink, art: 'dots', reads: 530,
    chapters: [
      { title: 'Ventana', daysAgo: 80, content: [
        { type: 'p', text: 'Alguien dibujó un sol en el vidrio empañado.', align: 'center' },
        { type: 'p', text: 'Afuera llueve igual, pero adentro alguien tuvo fe.', align: 'center' },
      ] },
      { title: 'Lista de cosas que abrigan', daysAgo: 73, content: [
        { type: 'p', text: 'Una bufanda prestada. Un mensaje que dice «llegaste bien».', align: 'center' },
        { type: 'p', text: 'El pan de la esquina a las siete. Tu risa, todavía.', align: 'center' },
      ] },
    ],
  },
  {
    author: 'ramiro.verso', title: 'Cómo sobrevivir al primer año de universidad', tagline: 'Lo que me hubiera gustado saber a los dieciocho.',
    synopsis: 'Consejos reales, sin frases motivacionales: cómo organizar el tiempo, pedir ayuda, comer bien con poco dinero y no pelearse con el compañero de cuarto.',
    kind: 'No ficción', genre: 'Amistad', tags: ['Universidad', 'Consejos'], rating: 'Todo público', status: 'En curso',
    color: '#0F8B80', ink: paper, art: 'sun', reads: 1470,
    chapters: [
      { title: 'El horario no es tu enemigo', daysAgo: 26, content: [
        p('El primer mes vas a querer ir a todo: talleres, fiestas, clubes. Elige dos cosas además de clases y dales un horario fijo. Lo demás puede esperar al segundo semestre.'),
        p('Anota en el calendario las fechas de exámenes el primer día. Parece obvio; casi nadie lo hace.'),
      ] },
      { title: 'Pedir ayuda no es rendirse', daysAgo: 5, content: [
        p('Las horas de consulta de los profesores existen y casi siempre están vacías. Ir una vez con una duda concreta cambia cómo te ven el resto del semestre.'),
      ] },
    ],
  },
];

export const READINGS: SeedReading[] = [
  { reader: 'caro.lee', story: 'El faro de las horas perdidas', at: 3, votes: [[1, 38], [2, 20], [3, 4]] },
  { reader: 'caro.lee', story: 'AU: Cafetería Teyvat', at: 2, votes: [[1, 10], [2, 1]] },
  { reader: 'caro.lee', story: 'Mi abuela tiene un club de detectives', at: 2, votes: [[2, 30]] },
  { reader: 'dani.paginas', story: 'Saque de práctica', at: 2, votes: [[1, 25], [2, 12]] },
  { reader: 'dani.paginas', story: 'Cartas al chico del 4B', at: 3, votes: [[1, 50], [3, 22]] },
  { reader: 'dani.paginas', story: 'La casa de la calle Ciprés', at: 2 },
  { reader: 'dani.paginas', story: 'La última partida en Inazuma', at: 2, votes: [[1, 15], [2, 7]] },
  { reader: 'vale.modera', story: 'La casa de la calle Ciprés', at: 3, votes: [[3, 39]] },
  { reader: 'vale.modera', story: 'Lo que queda de la noche', at: 2, votes: [[1, 12], [2, 2]] },
  { reader: 'vale.modera', story: 'Protocolo Ganímedes', at: 2, votes: [[2, 8]] },
  { reader: 'sofi.noches', story: 'Cartas al chico del 4B', at: 3, votes: [[3, 28]] },
  { reader: 'sofi.noches', story: 'El faro de las horas perdidas', at: 2, votes: [[2, 14]] },
  { reader: 'leo.escribe', story: 'La última partida en Inazuma', at: 1, votes: [[1, 6]] },
  { reader: 'tinta.lunar', story: 'Cómo sobrevivir al primer año de universidad', at: 2, votes: [[1, 20], [2, 3]] },
  { reader: 'marisol.fics', story: 'Mi abuela tiene un club de detectives', at: 2, votes: [[1, 45]] },
  { reader: 'ramiro.verso', story: 'Saque de práctica', at: 1, votes: [[1, 9]] },
];
