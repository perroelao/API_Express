//import de librerias 
const express = require('express')
const puerto = 3002
const oracledb = require('oracledb')
const dbconfig = {
    user: 'FERREMAS',
    password: 'FERREMAS',
    connectString: 'localhost:1521/orcl'
}
const carritos = {}

//crear api
const app = express()

//middleware
app.use(express.json())

//endpoints (CRUD)

// Obtener todos los productos
app.get('/productos', async (req,res) => {
    let cone
    try {
        cone = await oracledb.getConnection(dbconfig)
        const result = await cone.execute("SELECT * FROM PRODUCTO")
        res.status(200).json(result.rows.map(row => ({
            id: row[0],
            nombre: row[1],
            descripcion: row[2],
            precio: row[3],
            categoria_id: row[4],
            marca_id: row[5],
            imagen: row[6],
        })))
    } catch (ex) {
        res.status(500).json({error: ex.message})
    } finally {
        if (cone) cone.close()
    }
})

// Obtener un producto por ID
app.get('/productos/:id', async (req, res) => {
    let cone
    try {
        cone = await oracledb.getConnection(dbconfig)
        const result = await cone.execute(
            "SELECT * FROM PRODUCTO WHERE producto_id = :id",
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
            categoria_id: row[4],
            marca_id: row[5],
            imagen: row[6]
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
    const { nombre, descripcion, precio, categoria_id, marca_id, imagen } = req.body
    try {
        cone = await oracledb.getConnection(dbconfig)
        await cone.execute(
            `INSERT INTO PRODUCTO (producto_id, nombre, descripcion, precio, categoria_id, marca_id, imagen)
             VALUES (producto_seq.nextval, :nombre, :descripcion, :precio, :categoria_id, :marca_id, :imagen)`,
            { nombre, descripcion, precio, categoria_id, marca_id, imagen }
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
    const { nombre, descripcion, precio, categoria_id, marca_id, imagen } = req.body
    try {
        cone = await oracledb.getConnection(dbconfig)
        const result = await cone.execute(
            `UPDATE PRODUCTO SET nombre = :nombre, descripcion = :descripcion, precio = :precio, 
             categoria_id = :categoria_id, marca_id = :marca_id, imagen = :imagen WHERE producto_id = :id`,
            { nombre, descripcion, precio, categoria_id, marca_id, imagen, id: req.params.id }
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
    const valores = []
    Object.entries(req.body).forEach(([key, value], idx) => {
        campos.push(`${key} = :${key}`)
        valores.push(value)
    })
    try {
        cone = await oracledb.getConnection(dbconfig)
        const sql = `UPDATE PRODUCTO SET ${campos.join(', ')} WHERE producto_id = :id`
        valores.push(req.params.id)
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
app.post('/crear_pedido', async (req, res) => {
    let cone
    const { cliente_id, estado_id, sucursal_retiro, vendedor_id, productos } = req.body
    if (!cliente_id || !estado_id || !vendedor_id || !Array.isArray(productos) || productos.length === 0) {
        return res.status(400).json({ error: "Datos incompletos" })
    }
    // Calcular el total sumando cantidad * precio_unit de cada producto
    const total = productos.reduce((acc, prod) => acc + (prod.cantidad * prod.precio_unit), 0)
    try {
        cone = await oracledb.getConnection(dbconfig)
        // Obtener nuevo pedido_id
        const pedidoResult = await cone.execute("SELECT PEDIDO_SEQ.NEXTVAL FROM dual")
        const pedido_id = pedidoResult.rows[0][0]

        // Insertar en PEDIDO
        await cone.execute(
            `INSERT INTO PEDIDO (pedido_id, cliente_id, fecha_pedido, estado_id, sucursal_retiro, total, vendedor_id)
             VALUES (:pedido_id, :cliente_id, SYSDATE, :estado_id, :sucursal_retiro, :total, :vendedor_id)`,
            { pedido_id, cliente_id, estado_id, sucursal_retiro, total, vendedor_id }
        )

        // Insertar productos en DETALLE_PEDIDO
        for (const prod of productos) {
            const detalleResult = await cone.execute("SELECT DETALLE_PEDIDO_SEQ.NEXTVAL FROM dual")
            const detalle_id = detalleResult.rows[0][0]
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
            )
        }

        await cone.commit()
        res.status(201).json({ mensaje: "Pedido creado", pedido_id, total })
    } catch (ex) {
        res.status(500).json({ error: ex.message })
    } finally {
        if (cone) cone.close()
    }
})

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