# AtariWriter Plus XE: ingenieria inversa de la carga

Fecha: 2026-09-14  
Branch: `atariwriter`  
Imagen: `ATR/AtariWriterPlusXE.atr`

## Conclusion

AtariWriter Plus XE necesita una maquina XL/XE con 128 KiB y expansion
130XE, el ATR en `D1:`, DOS/CIO/SIO funcionales, y la deteccion de cartucho
XL/XE correcta mediante `TRIG3` (`$D013`). No necesita un Atari 850, una
impresora ni un handler `R:`.

La causa del bucle era `TRIG3=1` en jsA8E. En XL/XE ese registro no es un
tercer joystick liberado: refleja la linea RD5 y debe valer `0` cuando ningun
cartucho externo presenta ROM en `$A000-$BFFF`. El OS interpretaba el `1` como
cartucho presente, validaba `RAMSUM` durante el `WARMSV` solicitado por
AtariWriter y convertia ese arranque calido en un cold start. Con `TRIG3=0`,
el OS sigue la ruta sin cartucho y AtariWriter llega al menu.

## Imagen y sistema de archivos

El ATR es una imagen DOS 2.0S valida de 720 sectores de 128 bytes: 92.160
bytes de datos mas una cabecera ATR de 16 bytes. Las cadenas DOS se obtuvieron
de los bytes 125-127 de cada sector.

| Fichero | Sectores | Primer sector | Cadena relevante |
|---|---:|---:|---|
| `DOS.SYS` | 37 | 4 | cargador DOS |
| `DUP.SYS` | 42 | 41 | utilidades DOS |
| `AUTORUN.SYS` | 6 | 83 | `83,84,85,86,87,505` |
| `AP.OBJ` | 210 | 88 | `88..289,499..502,506,516,524,543` |
| `PROOF` | 112 | 290 | corrector opcional |
| `PD` | 33 | 406 | controlador de impresion |
| `MM.OBJ` | 91 | 420 | mail merge opcional |

`AP.OBJ` esta fragmentado. Un lector DOS debe seguir su cadena de sectores y
no puede tratar el fichero como un rango contiguo. No hay firmware 850,
handler `R:` ni controlador serie adicional en la imagen.

## Cadena de ejecucion extraida

1. DOS carga `AUTORUN.SYS`.
2. `AUTORUN.SYS` contiene segmentos `$2000-$20B0` y `$20B5-$22AE`; su
   `RUNAD` es `$223B`.
3. Abre `D:AP.OBJ` por IOCB/CIO (`CIOV=$E456`), lo lee en bloques y cierra el
   IOCB. La carga depende del DOS invitado, no de un atajo del host.
4. `AP.OBJ` es un XEX de 26.190 bytes con segmentos dispersos y
   `RUNAD=$BB3B`.
5. El programa prueba RAM extendida, intenta opcionalmente abrir `R:`, instala
   `DOSINI=$2800`, pone `COLDST=$00` y llama a `WARMSV`.
6. El segundo estadio del arranque calido termina en el menu de usuario.

## Requisito de memoria 130XE

Los primeros segmentos de `AP.OBJ` escriben, en este orden:

| Orden | Segmento XEX |
|---:|---|
| 1 | `$D301=$EF` |
| 2-6 | 4.454 bytes en `$4000-$4E3D` |
| 7 | `$D301=$EB` |
| 8 | `$D301=$FF` |

`AUTORUN.SYS` tambien ejecuta en `$2263-$227D` una prueba explicita:

```asm
LDA #$EF
STA $D301
STA $4000
LDA #$EB
STA $D301
STA $4000
LDA #$EF
STA $D301
CMP $4000
BNE $2280
JMP $2000
```

En 64 KiB falla deliberadamente y deja `COLDST=$09`. En 130XE, `$EF` y `$EB`
seleccionan bancos distintos; la ventana CPU es `$4000-$7FFF`, la RAM base
oculta debe conservarse y ANTIC permanece independiente cuando su bit de
ventana no esta activo. Estas reglas corresponden a AHRM 2.7.

## El 850 y `R:` son opcionales

En `$BC21`, AtariWriter intenta `OPEN "R:"`. Si no existe, envia polls SIO
Type 1 `$50/$3F`. Si hubiera respuesta, copiaria un DCB, descargaria el booter
850 y ejecutaria `$0506`. Sin respuesta, el bus debe permanecer silencioso.

La ausencia del 850 no es un error fatal: la ruta termina en `$BC19`, limpia
`$0606` y salta a `$E474`. Por tanto, no se deben fabricar ACK, NAK, DCB,
booter ni handler. La hipotesis anterior que atribuia el bucle al timeout SIO
queda descartada.

## Vector de arranque y causa exacta

Los stubs de la ROM XL/XE usada son:

```asm
$E474  JMP $C290    ; WARMSV
$E477  JMP $C2C8    ; COLDSV
```

Los vectores no estaban corruptos. Antes de `$E474`, AtariWriter habia dejado
`DOSINI=$2800`, `RUNAD=$BB3B` y `COLDST=$00`. La decision equivocada se tomaba
dentro del OS en `$C290`.

AHRM 2.8 especifica que `TRIG3=1` significa que un cartucho externo presenta
RD5, `TRIG3=0` significa que no lo hace, y BASIC interno no afecta esa linea.
jsA8E inicializaba los cuatro triggers como joysticks liberados, incluido
`TRIG3=1`. El OS copiaba ese valor a `GINTLK` y trataba el warm start como el
caso de cartucho.

La ruta de cartucho llama a `$C4C9`, que suma `$BFF0-$C0EF`. El boot con BASIC
visible habia dejado `RAMSUM=$52`; AtariWriter desactiva BASIC y los 16 bytes
de `$BFF0-$BFFF` pasan a ser RAM a cero, por lo que la suma es `$9B`. La
desigualdad envia el OS a `$C2C8`, borra RAM y vuelve a bootear `D1:`. No era
un `CPU.reset()` disparado por el navegador: era una decision reproducible del
OS invitado causada por una entrada de hardware incorrecta.

Con `TRIG3=0`, tambien queda `GINTLK=0`; el OS reconoce que no hay cartucho,
omite la validacion de cartucho y conserva `DOSINI` durante `WARMSV`.

## Cambios genericos implementados

- `TRIG3` inicia en `0` en los nucleos JavaScript y C cuando no hay cartucho.
- `releaseAll()` ya no puede convertir RD5 en un joystick liberado.
- PIA PORTB separa ORB de DDRB. Tras reset, DDRB es `$00` y los pull-ups
  producen un valor MMU efectivo `$FF`; escribir DDRB recalcula el mapa de
  ROM y RAM extendida inmediatamente, conforme a AHRM 2.5-2.7.
- La automatizacion headless ahora transmite el perfil de expansion solicitado,
  evitando que una prueba declarada 130XE se ejecute silenciosamente en 64 KiB.
- Se agrego `pia_xlxe_defaults.test.js` para cubrir RD5/TRIG3 y DDRB/pull-ups.

No hay condiciones por nombre de ATR, direcciones privadas de AtariWriter ni
modificaciones de la imagen.

## Verificacion

La ejecucion corregida se mantuvo 80.083.406 ciclos con `D1:` y
`130xe-128k`. AtariWriter solicito un solo `WARMSV`; no hubo cold start
posterior, `COLDST` permanecio `$00`, `TRIG3/GINTLK` permanecieron `$00`, y la
pantalla mostro el menu completo: `Create File`, `Edit File`, `Verify
Spelling`, `Print File`, `Global Format`, `Mail Merge`, indices de ambas
unidades y las operaciones de carga/guardado.

Tambien pasan las regresiones de PIA, memoria bancaria 130XE,
potenciometros, snapshots y automatizacion headless. El nucleo C compila en
Release; solo conserva el warning de enlace `LNK4098` ya existente.
