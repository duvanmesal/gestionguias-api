# 01. Autenticacion, Sesion y Seguridad de Cuenta

## Proposito del modulo

El modulo de autenticacion protege el acceso al ecosistema y separa el comportamiento entre clientes `WEB` y `MOBILE`. La sesion no es solo un token: representa un acceso rastreable con plataforma, dispositivo, usuario, expiracion y revocacion.

## HU-AUTH-01 - Iniciar sesion

Como usuario registrado, quiero iniciar sesion con mi correo y contrasena, para acceder a las funciones permitidas por mi rol.

Criterios de aceptacion:

- El correo debe tener formato valido.
- La contrasena debe tener al menos 8 caracteres.
- El usuario debe existir y estar activo.
- Si el cliente es `MOBILE`, debe enviarse `deviceId`.
- El sistema genera un access token con audiencia segun plataforma.
- El sistema crea una sesion con plataforma, IP, user-agent, `deviceId` cuando aplica y refresh token hasheado.
- En `WEB`, el refresh token se entrega como cookie segura.
- En `MOBILE`, el refresh token se entrega en el body para almacenamiento seguro del cliente movil.
- Los errores de credenciales no deben revelar si el correo existe.

Reglas de negocio:

- Una cuenta inactiva no puede iniciar sesion.
- El header `X-Client-Platform` es obligatorio para flujos sensibles por plataforma.
- `WEB` y `MOBILE` no son intercambiables; cada sesion conserva su plataforma.

## HU-AUTH-02 - Renovar sesion

Como usuario autenticado, quiero renovar mi access token, para continuar trabajando sin iniciar sesion de nuevo.

Criterios de aceptacion:

- El refresh token debe existir, no estar vencido y no estar revocado.
- La plataforma de la solicitud debe coincidir con la plataforma de la sesion.
- El usuario asociado debe seguir activo.
- El sistema rota el refresh token de forma atomica.
- Si la rotacion falla por carrera o reutilizacion, el sistema revoca todas las sesiones del usuario.

Reglas de negocio:

- La reutilizacion de refresh token se interpreta como posible compromiso de seguridad.
- Ante reutilizacion, se cierran todas las sesiones del usuario para proteger la cuenta.
- La renovacion produce un access token nuevo y un refresh token nuevo.

## HU-AUTH-03 - Cerrar sesion actual

Como usuario autenticado, quiero cerrar mi sesion actual, para terminar el acceso desde el dispositivo que estoy usando.

Criterios de aceptacion:

- El usuario debe estar autenticado.
- El token debe contener el identificador de sesion.
- La sesion se marca como revocada si existe y aun no estaba revocada.
- En `WEB`, el cliente debe dejar de usar la cookie de refresh.
- La accion se registra en auditoria.

## HU-AUTH-04 - Cerrar todas las sesiones

Como usuario autenticado, quiero cerrar todas mis sesiones con verificacion adicional, para proteger mi cuenta si perdi acceso a algun dispositivo.

Criterios de aceptacion:

- El usuario solicita primero un codigo de verificacion.
- El codigo se envia al correo asociado a la cuenta.
- El codigo tiene expiracion.
- Para confirmar, el usuario debe enviar un codigo de 6 digitos valido.
- El codigo solo puede usarse una vez.
- Al confirmar, todas las sesiones activas del usuario quedan revocadas.

Reglas de negocio:

- Solo se soporta verificacion por codigo.
- Si el usuario esta inactivo, no puede ejecutar logout-all.
- La accion queda auditada como evento sensible.

## HU-AUTH-05 - Consultar perfil autenticado

Como usuario autenticado, quiero consultar mi perfil, para que la interfaz sepa mi rol, estado y datos basicos.

Criterios de aceptacion:

- El sistema devuelve identificador, correo, nombres, apellidos, rol, estado activo, estado de perfil y verificacion de correo.
- Si el usuario no existe, se rechaza la solicitud.
- El cliente usa esta informacion para decidir navegacion y permisos visibles.

## HU-AUTH-06 - Consultar y revocar sesiones

Como usuario autenticado, quiero ver mis sesiones activas y revocar una sesion especifica, para controlar mis accesos.

Criterios de aceptacion:

- El usuario puede listar sus sesiones activas.
- El usuario puede revocar una sesion por `sessionId`.
- Si la sesion ya esta revocada, el sistema rechaza la operacion.
- Si la sesion no existe, el sistema informa que no fue encontrada.

## HU-AUTH-07 - Cambiar contrasena

Como usuario autenticado, quiero cambiar mi contrasena, para mantener segura mi cuenta.

Criterios de aceptacion:

- El usuario debe enviar su contrasena actual (`currentPassword` u `oldPassword`) y una nueva contrasena.
- Solo se debe enviar uno de los nombres compatibles para la contrasena actual.
- La contrasena actual debe ser correcta.
- La nueva contrasena debe cumplir politica de seguridad: minimo 8 caracteres, mayuscula, minuscula, numero y caracter especial.
- La nueva contrasena debe ser distinta de la actual.
- Al cambiar la contrasena, todas las sesiones activas se cierran.
- La accion queda auditada.

## HU-AUTH-08 - Solicitar recuperacion de contrasena

Como usuario que olvido su contrasena, quiero solicitar recuperacion por correo, para restablecer mi acceso.

Criterios de aceptacion:

- La respuesta debe ser generica aunque el correo no exista.
- Si el usuario existe y esta activo, el sistema invalida tokens anteriores y crea un token nuevo con expiracion.
- El sistema envia un correo con enlace de recuperacion.
- El token se almacena hasheado.

Reglas de seguridad:

- No se debe revelar si el correo pertenece a una cuenta.
- Solo usuarios activos reciben enlace real.

## HU-AUTH-09 - Restablecer contrasena

Como usuario con token de recuperacion, quiero definir una nueva contrasena, para recuperar mi cuenta.

Criterios de aceptacion:

- El token debe existir, no estar vencido y no haber sido usado.
- La cuenta asociada debe estar activa.
- La nueva contrasena debe cumplir politica de seguridad.
- La nueva contrasena debe ser distinta de la actual.
- El token queda consumido.
- Todas las sesiones del usuario quedan revocadas.
- La accion queda auditada.

## HU-AUTH-10 - Solicitar verificacion de correo

Como usuario, quiero solicitar verificacion de correo, para confirmar que mi correo me pertenece.

Criterios de aceptacion:

- La respuesta debe ser segura y no revelar informacion innecesaria.
- Si el usuario no existe o esta inactivo, el sistema no envia correo y responde sin filtrar existencia.
- Si el correo ya esta verificado, el sistema no genera un token nuevo.
- Si aplica, invalida tokens anteriores y crea uno nuevo.
- En `WEB`, el flujo principal es un enlace con token.
- En `MOBILE`, el correo puede incluir enlace y codigo de 6 digitos.

## HU-AUTH-11 - Confirmar verificacion de correo

Como usuario, quiero confirmar mi correo mediante enlace o codigo, para completar la confianza basica de mi cuenta.

Criterios de aceptacion:

- El usuario puede confirmar con `token`.
- Alternativamente, puede confirmar con `email + code`.
- No se permite mezclar token con email/codigo.
- El token o codigo debe existir, no estar vencido, no estar usado y pertenecer a una cuenta activa.
- Al confirmar, `emailVerifiedAt` queda registrado.
- El token/codigo queda consumido.
- La accion queda auditada.

## Reglas generales de seguridad

- Los tokens sensibles se almacenan hasheados.
- Los codigos de verificacion expiran y se consumen una sola vez.
- Los eventos sensibles generan auditoria.
- Los rate limits protegen login, refresh, cambio de contrasena, recuperacion, verificacion y logout-all.
- Las diferencias `WEB` vs `MOBILE` son parte del contrato funcional y no deben simplificarse.
