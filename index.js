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

// endpoint para agregar un producto al carrito

// Agregar producto al carrito
app.post('/carrito/:usuarioId', (req, res) => {
    const usuarioId = req.params.usuarioId
    const { producto_id, cantidad } = req.body

    if (!carritos[usuarioId]) carritos[usuarioId] = []

    // Si ya existe el producto, suma la cantidad
    const idx = carritos[usuarioId].findIndex(p => p.producto_id === producto_id)
    if (idx >= 0) {
        carritos[usuarioId][idx].cantidad += cantidad
    } else {
        carritos[usuarioId].push({ producto_id, cantidad })
    }

    res.status(200).json({ mensaje: "Producto agregado al carrito", carrito: carritos[usuarioId] })
})

// Ver carrito de un usuario
app.get('/ver_carrito/:usuarioId', (req, res) => {
    const usuarioId = req.params.usuarioId
    res.status(200).json({ carrito: carritos[usuarioId] || [] })
})

// Eliminar producto del carrito
app.delete('/delp_carrito/:usuarioId/:producto_id', (req, res) => {
    const usuarioId = req.params.usuarioId
    const producto_id = parseInt(req.params.producto_id)
    if (!carritos[usuarioId]) return res.status(404).json({ error: "Carrito vacío" })

    carritos[usuarioId] = carritos[usuarioId].filter(p => p.producto_id !== producto_id)
    res.status(200).json({ mensaje: "Producto eliminado del carrito", carrito: carritos[usuarioId] })
})

// Vaciar carrito
app.delete('/del_carrito/:usuarioId', (req, res) => {
    const usuarioId = req.params.usuarioId
    carritos[usuarioId] = []
    res.status(200).json({ mensaje: "Carrito vaciado" })
})

//levantar api
app.listen(puerto, () => {
    console.log('API corriendo en el puerto ' + puerto)
})