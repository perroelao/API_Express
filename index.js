//import de librerias 
const { client: paypalClient } = require('./paypal');
const cors = require('cors')
const express = require('express')
const puerto = 3002
const oracledb = require('oracledb')
const dbconfig = {
    user: 'FERREMAS',
    password: 'FERREMAS',
    connectString: 'localhost:1521/orcl2'
}
const carritos = {}

//crear api
const app = express()

//middleware
app.use(express.json())
app.use(cors())

//endpoints (CRUD)

app.get('/productos', async (req, res) => {
    let cone;
    try {
        cone = await oracledb.getConnection(dbconfig);
        const result = await cone.execute(
            `SELECT 
                PRODUCTO_ID,
                NOMBRE,
                DESCRIPCION,
                PRECIO,
                CATEGORIA_ID,
                MARCA_ID,
                IMAGEN,
                STOCK
            FROM PRODUCTO`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        // Procesar CLOBs a string
        const productos = await Promise.all(result.rows.map(async row => {
            let imagen = row.IMAGEN;
            if (imagen && typeof imagen === 'object' && typeof imagen.getData === 'function') {
                imagen = await new Promise((resolve, reject) => {
                    let data = '';
                    imagen.setEncoding('utf8');
                    imagen.on('data', chunk => data += chunk);
                    imagen.on('end', () => resolve(data));
                    imagen.on('error', reject);
                });
            }
            return {
                producto_id: row.PRODUCTO_ID,
                nombre: row.NOMBRE,
                descripcion: row.DESCRIPCION,
                precio: row.PRECIO,
                categoria_id: row.CATEGORIA_ID,
                marca_id: row.MARCA_ID,
                imagen: imagen,
                stock: row.STOCK
            };
        }));

        res.status(200).json(productos);
    } catch (ex) {
        res.status(500).json({ error: ex.message });
    } finally {
        if (cone) await cone.close();
    }
});

// Obtener un producto por ID
app.get('/productos/:id', async (req, res) => {
    let cone
    try {
        cone = await oracledb.getConnection(dbconfig)
        const result = await cone.execute(
            `SELECT p.producto_id, p.nombre, p.descripcion, p.precio, 
                    c.nombre AS categoria, m.nombre AS marca, p.imagen, p.stock
             FROM PRODUCTO p
             JOIN CATEGORIA c ON p.categoria_id = c.categoria_id
             JOIN MARCA m ON p.marca_id = m.marca_id
             WHERE p.producto_id = :id`,
            [req.params.id]
        )
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Producto no encontrado" })
        }
        const row = result.rows[0]
        res.status(200).json({
            id: row[0],
            nombre: row[1],
            descripcion: row[2],
            precio: row[3],
            categoria: row[4],
            marca: row[5],
            imagen: row[6],
            stock: row[7]
        })
    } catch (ex) {
        res.status(500).json({ error: ex.message })
    } finally {
        if (cone) cone.close()
    }
})

// Crear un producto
app.post('/crear_productos', async (req, res) => {
    let cone
    const { nombre, descripcion, precio, categoria_id, marca_id, imagen, stock } = req.body
    try {
        cone = await oracledb.getConnection(dbconfig)
        await cone.execute(
            `INSERT INTO PRODUCTO (producto_id, nombre, descripcion, precio, categoria_id, marca_id, imagen, stock)
             VALUES (producto_seq.nextval, :nombre, :descripcion, :precio, :categoria_id, :marca_id, :imagen, :stock)`,
            { nombre, descripcion, precio, categoria_id, marca_id, imagen, stock }
        )
        await cone.commit()
        res.status(201).json({ mensaje: "Producto creado" })
    } catch (ex) {
        res.status(500).json({ error: ex.message })
    } finally {
        if (cone) cone.close()
    }
})

// Actualizar un producto (PUT)
app.put('/put_productos/:id', async (req, res) => {
    let cone
    const { nombre, descripcion, precio, categoria_id, marca_id, imagen, stock } = req.body
    try {
        cone = await oracledb.getConnection(dbconfig)
        const result = await cone.execute(
            `UPDATE PRODUCTO SET nombre = :nombre, descripcion = :descripcion, precio = :precio, 
             categoria_id = :categoria_id, marca_id = :marca_id, imagen = :imagen, stock = :stock WHERE producto_id = :id`,
            { nombre, descripcion, precio, categoria_id, marca_id, imagen, stock, id: req.params.id }
        )
        await cone.commit()
        if (result.rowsAffected === 0) {
            return res.status(404).json({ error: "Producto no encontrado" })
        }
        res.status(200).json({ mensaje: "Producto actualizado" })
    } catch (ex) {
        res.status(500).json({ error: ex.message })
    } finally {
        if (cone) cone.close()
    }
})

// Actualización parcial (PATCH)
app.patch('/patch_productos/:id', async (req, res) => {
    let cone
    const campos = []
    const valores = {}
    Object.entries(req.body).forEach(([key, value]) => {
        campos.push(`${key} = :${key}`)
        valores[key] = value
    })
    try {
        cone = await oracledb.getConnection(dbconfig)
        const sql = `UPDATE PRODUCTO SET ${campos.join(', ')} WHERE producto_id = :id`
        valores.id = req.params.id
        const result = await cone.execute(sql, valores)
        await cone.commit()
        if (result.rowsAffected === 0) {
            return res.status(404).json({ error: "Producto no encontrado" })
        }
        res.status(200).json({ mensaje: "Producto actualizado parcialmente" })
    } catch (ex) {
        res.status(500).json({ error: ex.message })
    } finally {
        if (cone) cone.close()
    }
})

// Eliminar un producto
app.delete('/del_productos/:id', async (req, res) => {
    let cone
    try {
        cone = await oracledb.getConnection(dbconfig)
        const result = await cone.execute(
            "DELETE FROM PRODUCTO WHERE producto_id = :id",
            [req.params.id]
        )
        await cone.commit()
        if (result.rowsAffected === 0) {
            return res.status(404).json({ error: "Producto no encontrado" })
        }
        res.status(200).json({ mensaje: "Producto eliminado" })
    } catch (ex) {
        res.status(500).json({ error: ex.message })
    } finally {
        if (cone) cone.close()
    }
})

// endpoint para crear pedidos

// Crear un pedido
// Crear un pedido
app.post('/crear_pedido', async (req, res) => {
    let cone;
    const { cliente_id, sucursal_retiro, vendedor_id, productos, metodo_pago_id, total } = req.body;
    if (!cliente_id || !vendedor_id || !Array.isArray(productos) || productos.length === 0 || !metodo_pago_id) {
        return res.status(400).json({ error: "Datos incompletos" });
    }
    const totalPedido = (typeof total === "number" && !isNaN(total)) 
        ? total 
        : productos.reduce((acc, prod) => acc + (prod.cantidad * prod.precio_unit), 0);

    // Si el método de pago es PayPal (por ejemplo, metodo_pago_id == 1)
    if (Number(metodo_pago_id) === 1) {
        const checkoutNodeJssdk = require('@paypal/checkout-server-sdk');
        const request = new checkoutNodeJssdk.orders.OrdersCreateRequest();
        request.prefer("return=representation");
        request.requestBody({
            intent: "CAPTURE",
            purchase_units: [{
                amount: {
                    currency_code: "USD", // Cambia si usas otra moneda
                    value: totalPedido.toFixed(2)
                }
            }]
        });

        try {
            const order = await paypalClient().execute(request);
            const approvalUrl = order.result.links.find(link => link.rel === "approve").href;
            return res.status(200).json({ approvalUrl, orderId: order.result.id });
        } catch (err) {
            return res.status(500).json({ error: "Error creando orden PayPal", details: err.message });
        }
    }

    // Si es transferencia (por ejemplo, metodo_pago_id == 4)
    try {
        cone = await oracledb.getConnection(dbconfig);

        // Buscar estado_id para "Pendiente"
        const estadoResult = await cone.execute(
            "SELECT estado_id FROM ESTADO WHERE LOWER(nombre) = 'pendiente'"
        );
        if (estadoResult.rows.length === 0) {
            return res.status(500).json({ error: "No existe estado 'Pendiente'" });
        }
        const estado_id = estadoResult.rows[0][0];

        // Obtener nuevo pedido_id
        const pedidoResult = await cone.execute("SELECT PEDIDO_SEQ.NEXTVAL FROM dual");
        const pedido_id = pedidoResult.rows[0][0];

        // Insertar en PEDIDO con estado "Pendiente"
        await cone.execute(
            `INSERT INTO PEDIDO (pedido_id, cliente_id, fecha_pedido, estado_id, sucursal_retiro, total, vendedor_id, tipo_despacho_id)
            VALUES (:pedido_id, :cliente_id, SYSDATE, :estado_id, :sucursal_retiro, :total, :vendedor_id, :tipo_despacho_id)`,
            { pedido_id, cliente_id, estado_id, sucursal_retiro, total: totalPedido, vendedor_id, tipo_despacho_id }
        );

        // Insertar productos en DETALLE_PEDIDO
        for (const prod of productos) {
            const detalleResult = await cone.execute("SELECT DETALLE_PEDIDO_SEQ.NEXTVAL FROM dual");
            const detalle_id = detalleResult.rows[0][0];
            await cone.execute(
                `INSERT INTO DETALLE_PEDIDO (detalle_id, pedido_id, producto_id, cantidad, precio_unit)
                 VALUES (:detalle_id, :pedido_id, :producto_id, :cantidad, :precio_unit)`,
                {
                    detalle_id,
                    pedido_id,
                    producto_id: prod.producto_id,
                    cantidad: prod.cantidad,
                    precio_unit: prod.precio_unit
                }
            );
        }

        // Estado de pago para transferencia (pendiente)
        let estado_pago_id = 2;

        // Obtener nuevo pago_id
        const pagoResult = await cone.execute("SELECT NVL(MAX(pago_id),0)+1 FROM PAGO");
        const pago_id = pagoResult.rows[0][0];

        await cone.execute(
            `INSERT INTO PAGO (pago_id, pedido_id, metodo_pago_id, monto, estado_pago_id)
             VALUES (:pago_id, :pedido_id, :metodo_pago_id, :monto, :estado_pago_id)`,
            {
                pago_id,
                pedido_id,
                metodo_pago_id,
                monto: totalPedido,
                estado_pago_id
            }
        );

        await cone.commit();
        res.status(201).json({ mensaje: "Pedido y pago creados", pedido_id, pago_id, total: totalPedido, estado_pago_id });
    } catch (ex) {
        res.status(500).json({ error: ex.message });
    } finally {
        if (cone) cone.close();
    }
});

// Eliminar un pedido (y sus detalles)
app.delete('/eliminar_pedido/:pedido_id', async (req, res) => {
    let cone
    const pedido_id = req.params.pedido_id
    try {
        cone = await oracledb.getConnection(dbconfig)
        // Eliminar detalles primero (por si no tienes ON DELETE CASCADE)
        await cone.execute(
            "DELETE FROM DETALLE_PEDIDO WHERE pedido_id = :pedido_id",
            { pedido_id }
        )
        // Eliminar el pedido
        const result = await cone.execute(
            "DELETE FROM PEDIDO WHERE pedido_id = :pedido_id",
            { pedido_id }
        )
        await cone.commit()
        if (result.rowsAffected === 0) {
            return res.status(404).json({ error: "Pedido no encontrado" })
        }
        res.status(200).json({ mensaje: "Pedido eliminado" })
    } catch (ex) {
        res.status(500).json({ error: ex.message })
    } finally {
        if (cone) cone.close()
    }
})

// Ver pedidos de un cliente (con detalles y nombre de producto)
app.get('/pedidos/:cliente_id', async (req, res) => {
    let cone
    const cliente_id = req.params.cliente_id
    try {
        cone = await oracledb.getConnection(dbconfig)
        // Obtener pedidos del cliente
        const pedidosResult = await cone.execute(
            `SELECT pedido_id, fecha_pedido, estado_id, sucursal_retiro, total, vendedor_id
             FROM PEDIDO WHERE cliente_id = :cliente_id
             ORDER BY fecha_pedido DESC`,
            { cliente_id }
        )
        const pedidos = []
        for (const row of pedidosResult.rows) {
            // Obtener detalles de cada pedido con nombre de producto
            const detallesResult = await cone.execute(
                `SELECT dp.producto_id, p.nombre, dp.cantidad, dp.precio_unit
                 FROM DETALLE_PEDIDO dp
                 JOIN PRODUCTO p ON dp.producto_id = p.producto_id
                 WHERE dp.pedido_id = :pedido_id`,
                { pedido_id: row[0] }
            )
            pedidos.push({
                pedido_id: row[0],
                fecha_pedido: row[1],
                estado_id: row[2],
                sucursal_retiro: row[3],
                total: row[4],
                vendedor_id: row[5],
                detalles: detallesResult.rows.map(det => ({
                    producto_id: det[0],
                    nombre: det[1],
                    cantidad: det[2],
                    precio_unit: det[3]
                }))
            })
        }
        res.status(200).json({ pedidos })
    } catch (ex) {
        res.status(500).json({ error: ex.message })
    } finally {
        if (cone) cone.close()
    }
})

//levantar api
app.listen(puerto, () => {
    console.log('API corriendo en el puerto ' + puerto)
})
