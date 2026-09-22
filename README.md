# Visualizador de Horarios ESPOL

Herramienta para revisar los horarios planificados de ESPOL: detecta cruces de horario de los profesores, muestra si un nivel de la malla curricular se puede cursar completo sin cruces y señala las franjas libres donde se podría abrir un paralelo nuevo.

Se compone de dos partes:

- **Extensión de Chrome.** Extrae los horarios planificados directamente desde el sistema académico de ESPOL, usando la sesión que ya tienes iniciada en el navegador.
- **Aplicación web.** Muestra y analiza esos horarios. Viene incluida en la extensión y también funciona sola cargando un archivo CSV.

La herramienta no usa ningún servidor externo. Los datos se guardan solo en tu navegador.

## Funcionalidades

### Extracción de horarios

Desde el popup de la extensión se indica el año, el término (primero, segundo o vacacional) y los códigos de materia a consultar. Los códigos se escriben uno por línea y aceptan rangos, por ejemplo `ELEG 1028-1052`.

La extensión recorre cada materia en la página de horarios planificados y obtiene, para cada paralelo de teoría y de práctica: profesor, días y horas, aula, cupo, quincena (si la práctica se dicta en semanas alternas), paralelos de práctica asociados y fechas de exámenes.

Si el sitio muestra un captcha durante la extracción, la extensión se detiene y muestra un aviso para resolverlo a mano antes de continuar. Al terminar, se descarga un archivo CSV con los datos y se abre el visualizador automáticamente.

Los cupos son los planificados por la institución, no los que quedan disponibles después de la matrícula.

### Horario semanal

Grilla de lunes a viernes, de 07:00 a 22:00, con todas las clases extraídas.

- Filtros por tipo (teoría o práctica), nivel y profesor.
- Cada profesor tiene un color propio y la leyenda permite filtrar por uno haciendo clic.
- Las clases que coinciden en el mismo horario se muestran lado a lado.
- Las prácticas quincenales se distinguen con una etiqueta Q1 o Q2 y un rayado.
- Al pasar el mouse sobre una clase, o al tocarla en una pantalla táctil, se ve el detalle: código, paralelo, profesor, horario, aula, cupo, nivel y quincena.
- Contadores de clases, profesores, materias y aulas del filtro actual.

### Cruces de horario

**Cruces entre profesores.** Lista a los profesores que tienen dos clases distintas en el mismo día y hora. Una práctica de la primera quincena y otra de la segunda no se consideran cruce, porque nunca ocurren la misma semana. Al hacer clic en el nombre de un profesor se abre el horario semanal filtrado por esa persona.

**Cursar un nivel completo sin cruces.** Al elegir un nivel se arman todas las opciones posibles por materia: cada paralelo de teoría con cada una de sus prácticas asociadas. A partir de ahí:

- *Buscar combinación sin cruces* encuentra una forma de tomar todas las materias del nivel sin que se crucen.
- *Ver todas las combinaciones sin cruces* genera todas las combinaciones válidas y permite recorrerlas una por una. La búsqueda se detiene en 200 combinaciones para no bloquear el navegador.
- También se puede elegir a mano el paralelo de cada materia. Las materias que se cruzan con otra quedan marcadas en rojo.
- Si no existe ninguna combinación posible, se indican los pares de materias que siempre se cruzan, sin importar el paralelo.
- El nivel y los paralelos elegidos se recuerdan al volver a la página.

**Huecos libres del nivel.** Sobre la misma grilla se marcan las franjas en las que ninguna materia del nivel tiene clase, es decir, donde se podría abrir un paralelo nuevo sin chocar con el resto del nivel. Se distinguen tres casos:

- Verde: libre todas las semanas.
- Naranja: libre solo en la primera quincena, porque en esa franja únicamente hay clases de la segunda.
- Morado: libre solo en la segunda quincena, porque en esa franja únicamente hay clases de la primera.

Debajo de la grilla se listan los huecos de cada día con su horario.

### Configuración de niveles

La página de configuración define a qué nivel de la malla curricular pertenece cada código de materia. La extensión usa este mapeo al extraer los datos y el visualizador lo usa para agrupar las materias por nivel. Los cambios se guardan en el navegador y se pueden revertir a los valores por defecto.

### Carga manual de CSV

Si ya tienes un CSV generado por la extensión, puedes abrir la aplicación y cargarlo desde la pantalla inicial sin volver a extraer los datos.

## Uso

1. Inicia sesión en el sistema académico de ESPOL y abre la página de horarios planificados:
   `https://www.academico.espol.edu.ec/UI/Registros/horariosplanificados.aspx`
2. Con esa pestaña activa, abre el popup de la extensión. El botón de extracción solo se habilita en esa página.
3. Ingresa año, término y códigos de materia, y haz clic en *Iniciar extracción*.
4. Al terminar se abre el horario semanal. Desde ahí puedes ir a *Cruces* o a *Niveles*.

La extensión no pide ni guarda tu contraseña: reutiliza la sesión abierta en el navegador.

## Instalación

### Requisitos

- Node.js en una versión LTS reciente, con npm (probado con Node.js 24).
- Google Chrome u otro navegador basado en Chromium.

### Compilar la extensión

```bash
npm install
npm run build:extension
```

Esto genera la carpeta `extension-dist/`, que contiene la extensión lista para cargar.

### Cargar la extensión en Chrome

1. Abre `chrome://extensions`.
2. Activa el *Modo de desarrollador*.
3. Haz clic en *Cargar descomprimida* y selecciona la carpeta `extension-dist/`.

Después de volver a compilar, usa el botón de recargar en la tarjeta de la extensión para que tome los cambios.

### Usar solo la aplicación web

Para desarrollar o para usarla con un CSV, sin la extensión:

```bash
npm install
npm run dev
```

La aplicación queda disponible en la dirección que muestra la terminal.

### Estructura del proyecto

- `extension/`: código de la extensión (popup, content script y service worker).
- `src/`: aplicación web en React y TypeScript.
- `src/lib/conflicts.ts`: detección de cruces, búsqueda de combinaciones y cálculo de huecos.
- `scripts/build-extension.mjs`: compila la aplicación y la empaqueta junto con la extensión en `extension-dist/`.
